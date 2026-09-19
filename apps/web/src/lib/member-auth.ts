import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
const COOKIE = "barbacue_member";
const MAX_AGE = 60 * 60 * 24 * 7;
function signature(payload: string) {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret || secret.length < 16) throw new Error("Sessão de cliente não configurada.");
  return createHmac("sha256", secret).update(`member:${payload}`).digest("base64url");
}
export function setMemberCookie(response: NextResponse, id: number) {
  const payload = `${id}|${Date.now() + MAX_AGE * 1000}`;
  response.cookies.set(COOKIE, `${payload}.${signature(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}
export function clearMemberCookie(response: NextResponse) { response.cookies.set(COOKIE, "", { path: "/", maxAge: 0 }); }
export async function getMember() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(signature(payload)); const actual = Buffer.from(mac);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const [id, expiry] = payload.split("|").map(Number);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(expiry) || expiry <= Date.now()) return null;
  const [member] = await db.select({ id: customerAccounts.id, name: customerAccounts.name, email: customerAccounts.email }).from(customerAccounts).where(eq(customerAccounts.id, id));
  return member ?? null;
}
