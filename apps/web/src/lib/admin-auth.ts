import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { StaffRole } from "@/db/schema";
import { STAFF_ROLES, canAccessPath, type Permission } from "@/lib/permissions";

const COOKIE_NAME = "barbacue_admin";
const MAX_AGE = 60 * 60 * 8; // 8 hours

// Every signed session belongs to an active individual staff account.
export interface AdminSession {
  userId: number;
  mustChangePassword?: boolean;
  role: StaffRole;
  name?: string;
  jobTitle?: string | null;
  permissions?: Permission[] | null;
}

// Token signing uses Web Crypto. Current roles and permissions are resolved
// from the database in Node (including Next.js 16 Proxy); password hashing
// remains in staff-auth.ts.

// Constant-time string compare. Leaks only length, which is acceptable for
// fixed-length HMAC outputs and operator-chosen env-var passwords.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// HMAC-SHA256 via Web Crypto so it works in BOTH the Edge runtime (proxy.ts
// middleware) and the Node runtime (route handlers). A keyed MAC — unlike a
// reversible base64(value:secret) scheme — never exposes the secret even if an
// attacker captures a cookie, and forgery requires the secret.
const enc = new TextEncoder();

async function importKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await importKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  const mac = Buffer.from(new Uint8Array(sig)).toString("base64url");
  return `${value}.${mac}`;
}

async function verify(token: string, secret: string): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const value = token.slice(0, dot);
  let sig: ArrayBuffer;
  try {
    const raw = Buffer.from(token.slice(dot + 1), "base64url");
    sig = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  } catch {
    return false;
  }
  const key = await importKey(secret, "verify");
  // crypto.subtle.verify performs a constant-time comparison internally.
  return crypto.subtle.verify("HMAC", key, sig, enc.encode(value));
}

const ROLES: readonly StaffRole[] = STAFF_ROLES;

/** Build a signed session token. Expiry is embedded INSIDE the signed payload
 * so a copied cookie can't outlive it by changing MaxAge client-side. */
export async function makeStaffToken(session: AdminSession): Promise<string> {
  if (!Number.isSafeInteger(session.userId) || session.userId <= 0) throw new Error("Individual staff account required");
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) throw new Error("ADMIN_COOKIE_SECRET is not configured");
  const expiresAt = Date.now() + MAX_AGE * 1000;
  return sign(`${session.userId}|${session.role}|${expiresAt}|${session.mustChangePassword ? "change-password" : "full"}`, secret);
}

/** Verify a token's signature + expiry and return the session, or null. */
export async function parseSession(token: string): Promise<AdminSession | null> {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret || !token) return null;
  if (!(await verify(token, secret))) return null;
  const dot = token.lastIndexOf(".");
  const [userIdStr, role, expiresAtStr, scope] = token.slice(0, dot).split("|");
  if (scope !== undefined && scope !== "full" && scope !== "change-password") return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;
  if (!ROLES.includes(role as StaffRole)) return null;
  const userId = Number(userIdStr);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  return { userId, role: role as StaffRole, mustChangePassword: scope === "change-password" };
}

/** Called from server components / server actions / Node route handlers to gate
 * admin actions. Throws "unauthorized" when there is no valid session. */
export async function requireStaff(): Promise<AdminSession> {
  const store = await cookies();
  const session = await parseSession(store.get(COOKIE_NAME)?.value ?? "");
  if (!session) throw new Error("unauthorized");
  const current = await resolveStaffSession(session);
  if (!current || current.mustChangePassword) throw new Error("unauthorized");
  return current;
}

/** Resolve current permissions so revocations apply to existing sessions. */
export async function resolveStaffSession(session: AdminSession): Promise<AdminSession | null> {
  if (!Number.isSafeInteger(session.userId) || session.userId <= 0) return null;
  const { db } = await import("@/db");
  const { staffUsers } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [user] = await db.select({ userId: staffUsers.id, role: staffUsers.role, name: staffUsers.name, jobTitle: staffUsers.jobTitle, permissions: staffUsers.permissions, active: staffUsers.active, mustChangePassword: staffUsers.mustChangePassword }).from(staffUsers).where(eq(staffUsers.id, session.userId));
  // A first-access cookie cannot become a full session after the password changes.
  if (session.mustChangePassword && !user?.mustChangePassword) return null;
  return user?.active ? user : null;
}

/** Require a minimum role. admin satisfies everything; manager satisfies manager. */
export async function requireRole(role: StaffRole): Promise<AdminSession> {
  const session = await requireStaff();
  if (session.role !== "admin" && session.role !== role) {
    throw new Error("forbidden");
  }
  return session;
}

/** Used in the login API route to set the session cookie. */
export async function setAdminCookie(
  response: NextResponse,
  session: AdminSession,
): Promise<void> {
  response.cookies.set(COOKIE_NAME, await makeStaffToken(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Used in the logout API route. */
export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}

/** Middleware (proxy.ts, Edge) helper — any valid staff session passes. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  const session = await parseSession(token);
  const current = session ? await resolveStaffSession(session) : null;
  return current !== null && !current.mustChangePassword;
}

// ─── In-handler guards ─────────────────────────────────────────────────────────
// Both the proxy and each handler enforce current permissions. Every new
// admin route needs a catalog mapping; unmapped routes fail closed.
// withRole adds a role restriction to the normal permission check.

type AdminHandler<Ctx> = (
  req: NextRequest,
  ctx: Ctx,
  session: AdminSession,
) => Response | Promise<Response>;

export function withStaff<Ctx>(handler: AdminHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    const session = await requireStaff().catch(() => null);
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (!canAccessPath(session, req.nextUrl.pathname)) return NextResponse.json({ error: "Você não tem permissão para esta função." }, { status: 403 });
    return handler(req, ctx, session);
  };
}

export function withRole<Ctx>(role: StaffRole, handler: AdminHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    const session = await requireStaff().catch(() => null);
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.role !== "admin" && session.role !== role) {
      return NextResponse.json(
        { error: "Apenas administradores podem fazer isso." },
        { status: 403 },
      );
    }
    if (!canAccessPath(session, req.nextUrl.pathname)) return NextResponse.json({ error: "Você não tem permissão para esta função." }, { status: 403 });
    return handler(req, ctx, session);
  };
}

/** The only environment credential required by staff login is the signing key. */
export function assertSecretsConfigured(): void {
  const secret = process.env.ADMIN_COOKIE_SECRET ?? "";
  if (secret.length < 16) throw new Error("Configuração insegura: ADMIN_COOKIE_SECRET ausente ou curto (<16 chars)");
}
