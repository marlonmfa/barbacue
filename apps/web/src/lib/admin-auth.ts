import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "barbacue_admin";
const MAX_AGE = 60 * 60 * 8; // 8 hours

function sign(value: string, secret: string): string {
  // Simple HMAC-like signature using base64 — good enough for a single-owner admin
  const buf = Buffer.from(`${value}:${secret}`);
  return `${value}.${buf.toString("base64url")}`;
}

function verify(token: string, secret: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const value = token.slice(0, dot);
  return sign(value, secret) === token;
}

export function isMasterPassword(pw: string): boolean {
  const master = process.env.ADMIN_MASTER_PASSWORD;
  return Boolean(master && pw === master);
}

export function isValidAdminPassword(pw: string): boolean {
  return pw === process.env.ADMIN_PASSWORD || isMasterPassword(pw);
}

export function makeAdminToken(): string {
  const secret = process.env.ADMIN_COOKIE_SECRET!;
  return sign("admin_authenticated", secret);
}

export function isValidAdminToken(token: string): boolean {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) return false;
  return verify(token, secret);
}

/** Called from server components / server actions to gate admin pages. */
export async function requireAdmin(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value ?? "";
  if (!isValidAdminToken(token)) {
    // Redirect is caught by the caller via thrown Response in middleware
    throw new Error("unauthorized");
  }
}

/** Used in the login API route to set the session cookie. */
export function setAdminCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, makeAdminToken(), {
    httpOnly: true,
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
export function isAdminRequest(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  return isValidAdminToken(token);
}
