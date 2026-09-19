import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { brandFromHost } from "@/lib/brand-storefront";
import { getManagedBrandStorefront } from "@/lib/managed-catalog";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET(request: NextRequest) {
  const requestHeaders = await headers();
  const requestedBrand = request.nextUrl.searchParams.get("brand");
  const brandSlug = requestedBrand === "chelas" || requestedBrand === "barbadog"
    ? requestedBrand
    : brandFromHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));

  if (brandSlug) {
    const brand = await getManagedBrandStorefront(brandSlug);
    const categoryNames = [...new Set(brand.items.map((item) => item.category))];
    return Response.json(categoryNames.map((name, categoryIndex) => ({
      id: categoryIndex + 1,
      name,
      slug: slugify(name),
      sortOrder: categoryIndex,
      products: brand.items.filter((item) => item.category === name).map((item, productIndex) => ({
        // Managed storefront ids are the real database ids used by chat and
        // checkout. Keeping them here lets test clients exercise the full flow.
        id: Number(item.id),
        externalId: item.id,
        categoryId: categoryIndex + 1,
        name: item.name,
        description: item.description || null,
        priceCents: item.originalPriceCents ?? item.priceCents,
        promoPriceCents: item.originalPriceCents ? item.priceCents : null,
        promoStartsAt: null,
        promoEndsAt: null,
        imageUrl: item.imageUrl,
        available: true,
        sortOrder: productIndex,
        ifoodUrl: item.ifoodUrl,
      })),
    })));
  }

  const cats = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder));

  const prods = await db
    .select()
    .from(products)
    .where(eq(products.available, true))
    .orderBy(asc(products.sortOrder));

  const grouped = cats.map((cat) => ({
    ...cat,
    products: prods.filter((p) => p.categoryId === cat.id),
  }));

  return Response.json(grouped);
}
