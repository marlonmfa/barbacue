import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { restaurantTables } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

const PatchSchema = z.object({
  number: z.number().int().positive().optional(),
  label: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
  // Rotate the QR token — instantly invalidates the old printed code.
  rotateToken: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = withStaff(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten(), message: "Dados inválidos." }, { status: 422 });
  }

  const { rotateToken, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (rotateToken) data.token = sql`gen_random_uuid()`;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "Nada para atualizar." }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(restaurantTables)
      .set(data)
      .where(eq(restaurantTables.id, Number(id)))
      .returning();
    if (!updated) return NextResponse.json({ message: "Mesa não encontrada." }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "Número de mesa já em uso." }, { status: 409 });
  }
});

export const DELETE = withStaff(async (_req: NextRequest, { params }: Params) => {
  const { id } = await params;
  await db.delete(restaurantTables).where(eq(restaurantTables.id, Number(id)));
  return NextResponse.json({ ok: true });
});
