import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { staffPresence } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { isStaffOnline, PRESENCE_TTL_MS } from "@/lib/staff-presence";

const headers = { "Cache-Control": "private, no-store" };
const payload = (row?: typeof staffPresence.$inferSelect) => ({ online: isStaffOnline(row), expiresInSeconds: PRESENCE_TTL_MS / 1000 });
export const GET = withStaff(async (_req, _ctx, session) => {
  const [row] = await db.select().from(staffPresence).where(eq(staffPresence.userId, session.userId));
  return NextResponse.json(payload(row), { headers });
});
const schema = z.object({ available: z.boolean() }).strict();
export const PATCH = withStaff(async (req, _ctx, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe sua disponibilidade." }, { status: 422, headers });
  const [row] = await db.insert(staffPresence).values({ userId: session.userId, available: parsed.data.available, lastSeenAt: sql`clock_timestamp()` })
    .onConflictDoUpdate({ target: staffPresence.userId, set: { available: parsed.data.available, lastSeenAt: sql`clock_timestamp()` } }).returning();
  return NextResponse.json(payload(row), { headers });
});
