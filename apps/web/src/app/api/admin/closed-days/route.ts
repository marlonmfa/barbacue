import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { closedDays } from "@/db/schema";
import { asc } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

// Both admins and managers manage closed days (the proxy gate authenticates;
// no extra role restriction needed here).

const ClosedDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional().nullable(),
});

export const GET = withStaff(async () => {
  const all = await db.select().from(closedDays).orderBy(asc(closedDays.date));
  return NextResponse.json(all);
});

export const POST = withStaff(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = ClosedDaySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const [row] = await db
      .insert(closedDays)
      .values({ date: parsed.data.date, reason: parsed.data.reason ?? null })
      // Idempotent on the unique date: update the reason if it already exists.
      .onConflictDoUpdate({ target: closedDays.date, set: { reason: parsed.data.reason ?? null } })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar a data" }, { status: 400 });
  }
});
