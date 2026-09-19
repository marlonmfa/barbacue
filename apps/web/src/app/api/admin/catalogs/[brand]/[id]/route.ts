import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { brandCatalogProducts, categories, products } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { isValidImageRef } from "@/lib/upload";

const PatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  category: z.string().trim().min(1).optional(),
  priceCents: z.number().int().positive().optional(),
  imageUrl: z.string().refine(isValidImageRef, "Imagem inválida").optional().nullable().or(z.literal("")),
  available: z.boolean().optional(),
});

type Params = { params: Promise<{ brand: string; id: string }> };

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function resolveCategory(name: string) {
  const all = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const found = all.find((category) => category.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  const base = slugify(name) || "categoria";
  let slug = base;
  let suffix = 2;
  while (all.some((category) => category.slug === slug)) slug = `${base}-${suffix++}`;
  const [created] = await db.insert(categories).values({ name, slug, sortOrder: all.length }).returning();
  return created;
}

export const PATCH = withStaff(async (req: NextRequest, { params }: Params) => {
  const { brand, id } = await params;
  if (!["barbacue", "barbadog", "chelas"].includes(brand)) return NextResponse.json({ error: "Restaurante inválido" }, { status: 404 });
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  if (brand === "barbacue") {
    const { category: categoryName, ...fields } = parsed.data;
    const category = categoryName ? await resolveCategory(categoryName) : null;
    const [updated] = await db.update(products).set({
      ...fields,
      ...(fields.imageUrl !== undefined ? { imageUrl: fields.imageUrl || null } : {}),
      ...(category ? { categoryId: category.id } : {}),
    }).where(eq(products.id, Number(id))).returning();
    if (!updated) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  }

  const { category, ...fields } = parsed.data;
  const [updated] = await db.update(brandCatalogProducts).set({
    ...fields,
    ...(category !== undefined ? { category } : {}),
    ...(fields.imageUrl !== undefined ? { imageUrl: fields.imageUrl || null } : {}),
    updatedAt: new Date(),
  }).where(and(eq(brandCatalogProducts.id, Number(id)), eq(brandCatalogProducts.brand, brand))).returning();
  if (!updated) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  return NextResponse.json(updated);
});

export const DELETE = withStaff(async (_req: NextRequest, { params }: Params) => {
  const { brand, id } = await params;
  if (brand === "barbacue") {
    await db.delete(products).where(eq(products.id, Number(id)));
  } else if (brand === "barbadog" || brand === "chelas") {
    await db.delete(brandCatalogProducts).where(and(eq(brandCatalogProducts.id, Number(id)), eq(brandCatalogProducts.brand, brand)));
  } else {
    return NextResponse.json({ error: "Restaurante inválido" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
