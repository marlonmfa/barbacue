import { GRANT_COOKIE } from "./cog-oidc";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import { sql } from 'drizzle-orm';
import { resolveCogEmail, uniqueEligibleAccount } from './cog-sso';
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
  const store=await cookies();
  return resolveRequestMember(store.get(COOKIE)?.value,store.get("cogia_sessao")?.value,await headers(),store.get(GRANT_COOKIE)?.value);
}
export async function resolveRequestMember(nativeToken:string|undefined,cogToken:string|undefined,requestHeaders?:Pick<Headers,"get">,grant?:string) {
  const email=await resolveCogEmail(cogToken,requestHeaders,grant);
  if(email){ const user=await findCogMember(email);if(user)return user; }
  const token = nativeToken;
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

/** A verified identity only selects an existing, unique local customer. */
export async function findCogMember(email:string) {
    const users=await db.select({id:customerAccounts.id,name:customerAccounts.name,email:customerAccounts.email}).from(customerAccounts).where(sql`lower(${customerAccounts.email}) = ${email}`).limit(2);
    return uniqueEligibleAccount(users);
}
