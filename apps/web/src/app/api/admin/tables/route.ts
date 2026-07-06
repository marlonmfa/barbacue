import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { restaurantTables } from "@/db/schema";
import { asc } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

// Mesas are day-to-day ops, so managers may manage them (withStaff, not admin).
const TableSchema = z.object({
  number: z.number().int().positive(),
  label: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
});

export const GET = withStaff(async () => {
  const all = await db.select().from(restaurantTables).orderBy(asc(restaurantTables.number));
  return NextResponse.json(all);
});

export const POST = withStaff(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = TableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten(), message: "Dados da mesa inválidos." }, { status: 422 });
  }
  try {
    const [table] = await db
      .insert(restaurantTables)
      .values({ number: parsed.data.number, label: parsed.data.label ?? null, active: parsed.data.active ?? true })
      .returning();
    return NextResponse.json(table, { status: 201 });
  } catch {
    // Unique violation on number.
    return NextResponse.json({ message: `Já existe a mesa ${parsed.data.number}.` }, { status: 409 });
  }
});
