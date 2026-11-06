import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/db";
import { brandCatalogProducts, categories, products } from "@/db/schema";
import { effectivePrice } from "@/lib/pricing";
import { isSharedCategory, RESTAURANT_LABEL, type Brand } from "@/lib/brands";

// Um pedido pode misturar produtos dos três restaurantes. Os IDs de produto só
// são únicos dentro de cada marca (Barbacue usa `products`, Chelas e Barbadog
// usam `brand_catalog_products`), por isso cada item carrega a sua marca.

export type RequestedItem = { productId: number; qty: number; brand?: Brand; notes?: string | null };
export type OrderLine = {
  productId: number; brand: Brand; restaurant: string | null; name: string;
  priceCents: number; qty: number; notes: string | null;
};
export type CatalogRow = { id: number; name: string; priceCents: number; available: boolean | null; category: string | null };

type Executor = Pick<typeof Db, "select">;

export class OrderItemError extends Error {
  constructor(public productId: number, public itemName?: string) { super(`Produto indisponível: ${itemName ?? productId}`); }
}

/** Busca os produtos de cada marca, com preço vigente e categoria. */
export async function loadCatalog(executor: Executor, wanted: Map<Brand, number[]>): Promise<Map<string, CatalogRow>> {
  const rows = new Map<string, CatalogRow>();
  for (const [brand, ids] of wanted) {
    if (!ids.length) continue;
    if (brand === "barbacue") {
      const found = await executor.select({ product: products, category: categories.name }).from(products)
        .leftJoin(categories, eq(categories.id, products.categoryId)).where(inArray(products.id, ids));
      for (const { product, category } of found) {
        rows.set(`barbacue:${product.id}`, { id: product.id, name: product.name, priceCents: effectivePrice(product), available: product.available, category });
      }
    } else {
      const found = await executor.select().from(brandCatalogProducts)
        .where(and(eq(brandCatalogProducts.brand, brand), inArray(brandCatalogProducts.id, ids)));
      for (const row of found) rows.set(`${brand}:${row.id}`, { id: row.id, name: row.name, priceCents: row.priceCents, available: row.available, category: row.category });
    }
  }
  return rows;
}

/** Monta as linhas do pedido a partir do catálogo; nunca confia em nome ou preço do cliente. */
export function canonicalOrderLines(requested: (RequestedItem & { name?: string })[], defaultBrand: Brand, catalog: Map<string, CatalogRow>): OrderLine[] {
  return requested.map(item => {
    const brand = item.brand ?? defaultBrand;
    const row = catalog.get(`${brand}:${item.productId}`);
    if (!row?.available || !Number.isSafeInteger(row.priceCents) || row.priceCents < 0) throw new OrderItemError(item.productId, item.name);
    return {
      productId: row.id, brand, restaurant: isSharedCategory(row.category) ? null : RESTAURANT_LABEL[brand],
      name: row.name, priceCents: row.priceCents, qty: item.qty, notes: item.notes || null,
    };
  });
}

export async function resolveOrderLines(executor: Executor, requested: (RequestedItem & { name?: string })[], defaultBrand: Brand) {
  const wanted = new Map<Brand, number[]>();
  for (const item of requested) {
    const brand = item.brand ?? defaultBrand;
    wanted.set(brand, [...new Set([...(wanted.get(brand) ?? []), item.productId])]);
  }
  return canonicalOrderLines(requested, defaultBrand, await loadCatalog(executor, wanted));
}

export { orderLineLabel } from "@/lib/brands";

/**
 * Marca que identifica o pedido (impressora, painel, relatórios): a que tem mais
 * itens próprios. Bebidas e itens comuns não contam; sem itens próprios, vale a
 * marca de onde o pedido foi feito.
 */
export function mainBrand(lines: Pick<OrderLine, "brand" | "restaurant" | "qty">[], fallback: Brand): Brand {
  const totals = new Map<Brand, number>();
  for (const line of lines) if (line.restaurant) totals.set(line.brand, (totals.get(line.brand) ?? 0) + line.qty);
  let best = fallback; let bestQty = totals.get(fallback) ?? 0;
  for (const [brand, qty] of totals) if (qty > bestQty) { best = brand; bestQty = qty; }
  return best;
}
