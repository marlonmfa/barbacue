import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

const PatchSchema = z.object({
  code: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  discountType: z.enum(["flat", "percentage"]).optional(),
  discountValue: z.number().int().positive().optional(),
  minOrderCents: z.number().int().min(0).optional(),
  maxUsages: z.number().int().positive().optional().nullable(),
  active: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = withStaff(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const data: Record<string, unknown> = { ...parsed.data };
  if ("expiresAt" in data) {
    data.expiresAt = data.expiresAt ? new Date(data.expiresAt as string) : null;
  }

  const [updated] = await db
    .update(coupons)
    .set(data)
    .where(eq(coupons.id, Number(id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
});

export const DELETE = withStaff(async (_req: NextRequest, { params }: Params) => {
  const { id } = await params;
  await db.delete(coupons).where(eq(coupons.id, Number(id)));
  return NextResponse.json({ ok: true });
});
