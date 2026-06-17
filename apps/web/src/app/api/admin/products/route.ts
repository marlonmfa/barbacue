import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

const ProductSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceCents: z.number().int().positive(),
  imageUrl: z.string().url().optional().nullable(),
  available: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const prods = await db.select().from(products).orderBy(asc(products.sortOrder));
  return NextResponse.json({ categories: cats, products: prods });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ProductSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const [product] = await db.insert(products).values(parsed.data).returning();
  return NextResponse.json(product, { status: 201 });
}
