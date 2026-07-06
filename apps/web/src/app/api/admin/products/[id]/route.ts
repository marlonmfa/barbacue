import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

const PatchSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  priceCents: z.number().int().positive().optional(),
  promoPriceCents: z.number().int().positive().optional().nullable(),
  promoStartsAt: z.string().datetime().optional().nullable(),
  promoEndsAt: z.string().datetime().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  available: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = withStaff(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const data: Record<string, unknown> = { ...parsed.data };
  if ("promoStartsAt" in data) data.promoStartsAt = data.promoStartsAt ? new Date(data.promoStartsAt as string) : null;
  if ("promoEndsAt" in data) data.promoEndsAt = data.promoEndsAt ? new Date(data.promoEndsAt as string) : null;

  const [updated] = await db
    .update(products)
    .set(data)
    .where(eq(products.id, Number(id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
});

export const DELETE = withStaff(async (_req: NextRequest, { params }: Params) => {
  const { id } = await params;
  await db.delete(products).where(eq(products.id, Number(id)));
  return NextResponse.json({ ok: true });
});
