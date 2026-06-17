import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "barbacue_admin";
const MAX_AGE = 60 * 60 * 8; // 8 hours

// HMAC-SHA256 via Web Crypto so it works in BOTH the Edge runtime (proxy.ts
// middleware) and the Node runtime (route handlers). A keyed MAC — unlike the
// previous reversible base64(value:secret) scheme — never exposes the secret
// even if an attacker captures a cookie, and forgery requires the secret.
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
  return Boolean(master && pw === master);
}

export function isValidAdminPassword(pw: string): boolean {
  return pw === process.env.ADMIN_PASSWORD || isMasterPassword(pw);
}

export async function makeAdminToken(): Promise<string> {
  const secret = process.env.ADMIN_COOKIE_SECRET!;
  return sign("admin_authenticated", secret);
}

export async function isValidAdminToken(token: string): Promise<boolean> {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) return false;
  return verify(token, secret);
}

/** Called from server components / server actions to gate admin pages. */
export async function requireAdmin(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value ?? "";
  if (!(await isValidAdminToken(token))) {
    throw new Error("unauthorized");
  }
}

/** Used in the login API route to set the session cookie. */
export async function setAdminCookie(response: NextResponse): Promise<void> {
  response.cookies.set(COOKIE_NAME, await makeAdminToken(), {
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

/** Middleware helper — reads the cookie from the request directly. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  return isValidAdminToken(token);
}
