import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { StaffRole } from "@/db/schema";

const COOKIE_NAME = "barbacue_admin";
const MAX_AGE = 60 * 60 * 8; // 8 hours

// A signed session. userId 0 is reserved for the env-based master login
// (ADMIN_PASSWORD / ADMIN_MASTER_PASSWORD), which always has the admin role so
// a fresh database is never locked out before any staff_users row exists.
export interface AdminSession {
  userId: number;
  role: StaffRole;
}

// IMPORTANT: this module is imported by proxy.ts (Edge runtime). Keep it free of
// node:crypto — only Web Crypto (crypto.subtle) and Buffer (polyfilled in Edge).
// Password hashing (scrypt) lives in lib/staff-auth.ts, imported only by Node
// route handlers.

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

export function isMasterPassword(pw: string): boolean {
  const master = process.env.ADMIN_MASTER_PASSWORD;
  return Boolean(master && safeEqual(pw, master));
}

export function isValidAdminPassword(pw: string): boolean {
  const main = process.env.ADMIN_PASSWORD;
  if (main && safeEqual(pw, main)) return true;
  return isMasterPassword(pw);
}

const ROLES: readonly StaffRole[] = ["admin", "manager"];

/** Build a signed session token. Expiry is embedded INSIDE the signed payload
 * so a copied cookie can't outlive it by changing MaxAge client-side. */
export async function makeStaffToken(session: AdminSession): Promise<string> {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) throw new Error("ADMIN_COOKIE_SECRET is not configured");
  const expiresAt = Date.now() + MAX_AGE * 1000;
  return sign(`${session.userId}|${session.role}|${expiresAt}`, secret);
}

/** Verify a token's signature + expiry and return the session, or null. */
export async function parseSession(token: string): Promise<AdminSession | null> {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret || !token) return null;
  if (!(await verify(token, secret))) return null;
  const dot = token.lastIndexOf(".");
  const [userIdStr, role, expiresAtStr] = token.slice(0, dot).split("|");
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;
  if (!ROLES.includes(role as StaffRole)) return null;
  const userId = Number(userIdStr);
  if (!Number.isFinite(userId)) return null;
  return { userId, role: role as StaffRole };
}

/** Called from server components / server actions / Node route handlers to gate
 * admin actions. Throws "unauthorized" when there is no valid session. */
export async function requireStaff(): Promise<AdminSession> {
  const store = await cookies();
  const session = await parseSession(store.get(COOKIE_NAME)?.value ?? "");
  if (!session) throw new Error("unauthorized");
  return session;
}

/** Require a minimum role. admin satisfies everything; manager satisfies manager. */
export async function requireRole(role: StaffRole): Promise<AdminSession> {
  const session = await requireStaff();
  if (role === "admin" && session.role !== "admin") {
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
  return (await parseSession(token)) !== null;
}

// ─── In-handler guards ─────────────────────────────────────────────────────────
// The proxy authenticates the session but performs NO role check, so every admin
// route MUST gate itself. Wrap a handler with withStaff (admin OR manager) or
// withRole("admin"). The wrapped handler receives the resolved session as its 3rd
// argument. These are Edge-safe (no node:crypto) but only used in Node routes.

type AdminHandler<Ctx> = (
  req: NextRequest,
  ctx: Ctx,
  session: AdminSession,
) => Response | Promise<Response>;

export function withStaff<Ctx>(handler: AdminHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    const session = await requireStaff().catch(() => null);
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    return handler(req, ctx, session);
  };
}

export function withRole<Ctx>(role: StaffRole, handler: AdminHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    const session = await requireStaff().catch(() => null);
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (role === "admin" && session.role !== "admin") {
      return NextResponse.json(
        { error: "Apenas administradores podem fazer isso." },
        { status: 403 },
      );
    }
    return handler(req, ctx, session);
  };
}

// Placeholder values shipped in .env.example — refusing these stops a deploy from
// silently running with a guessable admin password / forgeable cookie secret.
const PLACEHOLDERS = new Set([
  "",
  "troque-isto",
  "troque-isso",
  "changeme",
  "change-me",
  "barba@admin2025", // the value committed in docs/memory — must be rotated in prod
]);

/** Throws ONLY on a genuinely broken/forgeable config (missing or short cookie
 * secret → sessions can't be signed; no password at all → nobody can log in).
 * A weak/placeholder password is loudly WARNED but not blocked, so a live deploy
 * that hasn't rotated yet isn't bricked. Called by the login route. */
export function assertSecretsConfigured(): void {
  const secret = process.env.ADMIN_COOKIE_SECRET ?? "";
  const pw = process.env.ADMIN_PASSWORD ?? "";
  const master = process.env.ADMIN_MASTER_PASSWORD ?? "";

  const fatal: string[] = [];
  if (secret.length < 16) fatal.push("ADMIN_COOKIE_SECRET ausente ou curto (<16 chars)");
  if (!pw && !master) fatal.push("ADMIN_PASSWORD/ADMIN_MASTER_PASSWORD ausentes");
  if (fatal.length) throw new Error("Configuração insegura: " + fatal.join("; "));

  if (pw && PLACEHOLDERS.has(pw) && process.env.NODE_ENV === "production") {
    console.warn(
      "[segurança] ADMIN_PASSWORD ainda é um valor padrão/placeholder — troque em produção.",
    );
  }
}
