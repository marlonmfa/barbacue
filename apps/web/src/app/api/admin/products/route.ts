import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";
import { isValidImageRef } from "@/lib/upload";

const ProductSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceCents: z.number().int().positive(),
  promoPriceCents: z.number().int().positive().optional().nullable(),
  promoStartsAt: z.string().datetime().optional().nullable(),
  promoEndsAt: z.string().datetime().optional().nullable(),
  // Accept absolute http(s) URLs AND our own root-relative paths ("/api/media/…",
  // "/generated/…"). z.string().url() rejected the latter, silently blocking
  // create-with-uploaded-image. The PATCH route was already permissive.
  imageUrl: z.string().refine(isValidImageRef, "URL de imagem inválida").optional().nullable(),
  available: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const GET = withStaff(async () => {
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const prods = await db.select().from(products).orderBy(asc(products.sortOrder));
  return NextResponse.json({ categories: cats, products: prods });
});

export const POST = withStaff(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = ProductSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { promoStartsAt, promoEndsAt, ...rest } = parsed.data;
  const [product] = await db
    .insert(products)
    .values({
      ...rest,
      promoStartsAt: promoStartsAt ? new Date(promoStartsAt) : null,
      promoEndsAt: promoEndsAt ? new Date(promoEndsAt) : null,
    })
    .returning();
  return NextResponse.json(product, { status: 201 });
});
