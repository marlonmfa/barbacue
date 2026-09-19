import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brandCatalogProducts } from "@/db/schema";
import { getBrandStorefront, type BrandSlug, type BrandStorefront } from "@/lib/brand-storefront";
import barbadogMenu from "@/data/barbadog.json";
import chelasMenu from "@/data/chelas.json";

const snapshots = { barbadog: barbadogMenu, chelas: chelasMenu } as const;

/**
 * Import snapshot rows once. Conflict-ignore preserves every admin edit on
 * future reads while still picking up newly scraped products after a deploy.
 */
export async function ensureBrandCatalogs() {
  for (const brand of ["barbadog", "chelas"] as const) {
    const snapshot = snapshots[brand];
    if (snapshot.items.length === 0) continue;
    await db.insert(brandCatalogProducts).values(snapshot.items.map((item, index) => ({
      brand,
      externalId: item.id,
      name: item.name,
      description: item.description || null,
      category: item.category,
      priceCents: item.priceCents,
      originalPriceCents: item.originalPriceCents,
      imageUrl: item.imageUrl,
      ifoodUrl: item.ifoodUrl,
      available: true,
      source: "ifood",
      sortOrder: index,
    }))).onConflictDoNothing();
  }
}

/** Managed public catalog, with a safe snapshot fallback before migrations run. */
export async function getManagedBrandStorefront(slug: BrandSlug): Promise<BrandStorefront> {
  const fallback = getBrandStorefront(slug);
  try {
    let rows = await db
      .select()
      .from(brandCatalogProducts)
      .where(eq(brandCatalogProducts.brand, slug))
      .orderBy(asc(brandCatalogProducts.sortOrder));
    if (rows.length === 0) {
      await ensureBrandCatalogs();
      rows = await db
        .select()
        .from(brandCatalogProducts)
        .where(eq(brandCatalogProducts.brand, slug))
        .orderBy(asc(brandCatalogProducts.sortOrder));
    }
    if (rows.length === 0) return fallback;
    return {
      ...fallback,
      items: rows.filter((row) => row.available).map((row) => ({
        // The native checkout uses the managed table's numeric primary key.
        // `externalId` remains the stable iFood sync identity behind the scenes.
        id: String(row.id),
        name: row.name,
        description: row.description ?? "",
        priceCents: row.priceCents,
        originalPriceCents: row.originalPriceCents,
        imageUrl: row.imageUrl,
        category: row.category,
        ifoodUrl: row.ifoodUrl || fallback.ifoodUrl,
      })),
    };
  } catch {
    return fallback;
  }
}
