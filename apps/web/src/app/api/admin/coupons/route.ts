import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { desc } from "drizzle-orm";

const CouponSchema = z.object({
  code: z.string().min(1).transform((s) => s.toUpperCase().trim()),
  description: z.string().optional(),
  discountType: z.enum(["flat", "percentage"]),
  discountValue: z.number().int().positive(),
  minOrderCents: z.number().int().min(0).optional(),
  maxUsages: z.number().int().positive().optional().nullable(),
  active: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET() {
  const all = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CouponSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const data = {
    ...parsed.data,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  };

  const [coupon] = await db.insert(coupons).values(data).returning();
  return NextResponse.json(coupon, { status: 201 });
}
