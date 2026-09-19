import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { brandCatalogProducts, categories, products } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { ensureBrandCatalogs } from "@/lib/managed-catalog";
import { isValidImageRef } from "@/lib/upload";

const ProductSchema = z.object({
  brand: z.enum(["barbacue", "barbadog", "chelas"]),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  category: z.string().trim().min(1),
  priceCents: z.number().int().positive(),
  imageUrl: z.string().refine(isValidImageRef, "Imagem inválida").optional().nullable().or(z.literal("")),
  available: z.boolean().optional(),
});

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

export const GET = withStaff(async () => {
  await ensureBrandCatalogs();
  const [native, managed] = await Promise.all([
    db.select({
      id: products.id,
      name: products.name,
      description: products.description,
      category: categories.name,
      priceCents: products.priceCents,
      imageUrl: products.imageUrl,
      available: products.available,
    }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).orderBy(asc(products.sortOrder)),
    db.select().from(brandCatalogProducts).orderBy(asc(brandCatalogProducts.sortOrder)),
  ]);

  return NextResponse.json([
    ...native.map((product) => ({ ...product, brand: "barbacue", source: "native", category: product.category ?? "Outros" })),
    ...managed.map((product) => ({
      id: product.id,
      brand: product.brand,
      name: product.name,
      description: product.description,
      category: product.category,
      priceCents: product.priceCents,
      imageUrl: product.imageUrl,
      available: product.available,
      source: product.source,
    })),
  ]);
});

export const POST = withStaff(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = ProductSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const data = parsed.data;

  if (data.brand === "barbacue") {
    const category = await resolveCategory(data.category);
    const [created] = await db.insert(products).values({
      name: data.name,
      description: data.description || null,
      categoryId: category.id,
      priceCents: data.priceCents,
      imageUrl: data.imageUrl || null,
      available: data.available ?? true,
      sortOrder: 0,
    }).returning();
    return NextResponse.json({ ...created, brand: data.brand, category: category.name, source: "native" }, { status: 201 });
  }

  const fallbackUrl = data.brand === "chelas"
    ? process.env.IFOOD_CHELAS_URL
    : process.env.IFOOD_BARBADOG_URL;
  const [created] = await db.insert(brandCatalogProducts).values({
    brand: data.brand,
    externalId: `custom:${crypto.randomUUID()}`,
    name: data.name,
    description: data.description || null,
    category: data.category,
    priceCents: data.priceCents,
    imageUrl: data.imageUrl || null,
    ifoodUrl: fallbackUrl || null,
    available: data.available ?? true,
    source: "custom",
    sortOrder: 9999,
  }).returning();
  return NextResponse.json(created, { status: 201 });
});
