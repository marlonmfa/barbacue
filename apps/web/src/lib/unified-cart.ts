import { BRANDS, type Brand } from "./brands";

export function cartRecommendations(brands: readonly Brand[]): Brand[] {
  if (!brands.length) return [];
  return (["barbacue", "chelas"] as Brand[]).filter(brand => !brands.includes(brand));
}

export function cartItemKey(brand: Brand, productId: number): string {
  return `${brand}:${productId}`;
}

/** Catalogs have independent ids. Resolve both brand and id, using server prices. */
export function canonicalOnlineItems(
  requested: { productId: number; brand?: Brand; qty: number; notes?: string }[],
  defaultBrand: Brand,
  catalog: { id: number; brand: Brand; name: string; priceCents: number; available: boolean | null }[],
) {
  const byKey = new Map(catalog.map(product => [cartItemKey(product.brand, product.id), product]));
  const seen = new Set<string>();
  const mixed = new Set(requested.map(item => item.brand ?? defaultBrand)).size > 1;
  return requested.map(item => {
    const brand = item.brand ?? defaultBrand;
    const key = cartItemKey(brand, item.productId);
    const product = byKey.get(key);
    if (seen.has(key) || !product?.available || !Number.isSafeInteger(product.priceCents) || product.priceCents < 0) {
      throw new Error("Um produto ficou indisponível. Atualize o cardápio e revise o pedido.");
    }
    seen.add(key);
    return { productId: product.id, brand, name: mixed ? `${BRANDS[brand]} · ${product.name}` : product.name,
      priceCents: product.priceCents, qty: item.qty, notes: item.notes || null };
  });
}
