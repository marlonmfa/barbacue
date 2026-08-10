import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { AdminSession } from "@/lib/admin-auth";

// Node-only (scrypt). NEVER import this from proxy.ts / Edge code — see admin-auth.ts.

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

/** Hash a password as "saltHex:hashHex" using scrypt (no external deps). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time verify against a stored "saltHex:hashHex". */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Authenticate a staff account by username + password. Returns a session on
 * success, or null (wrong creds / inactive / unknown user). */
export async function authenticateStaff(
  username: string,
  password: string,
): Promise<AdminSession | null> {
  const [user] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.username, username.trim().toLowerCase()));
  if (!user || !user.active) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  return { userId: user.id, role: user.role };
}
