import { BRANDS, type Brand } from "./brands";
import { cartLineKey, optionGroupsFor, OPTION_GROUP_LIMIT, type MenuChoice } from "./menu-options";

export function cartRecommendations(brands: readonly Brand[]): Brand[] {
  if (!brands.length) return [];
  return (["barbacue", "chelas"] as Brand[]).filter(brand => !brands.includes(brand));
}

export function cartItemKey(brand: Brand, productId: number): string {
  return `${brand}:${productId}`;
}

/** Catalogs have independent ids. Resolve both brand and id, using server prices. */
export function canonicalOnlineItems(
  requested: { productId: number; brand?: Brand; qty: number; notes?: string; choices?: MenuChoice[] }[],
  defaultBrand: Brand,
  catalog: { id: number; brand: Brand; name: string; priceCents: number; available: boolean | null; category?: string | null }[],
) {
  const byKey = new Map(catalog.map(product => [cartItemKey(product.brand, product.id), product]));
  const seen = new Set<string>();
  const mixed = new Set(requested.map(item => item.brand ?? defaultBrand)).size > 1;
  return requested.map(item => {
    const brand = item.brand ?? defaultBrand;
    const key = cartItemKey(brand, item.productId);
    const product = byKey.get(key);
    const lineKey = cartLineKey({ ...item, brand });
    if (seen.has(lineKey) || !product?.available || !Number.isSafeInteger(product.priceCents) || product.priceCents < 0) {
      throw new Error("Um produto ficou indisponível. Atualize o cardápio e revise o pedido.");
    }
    seen.add(lineKey);
    const allowed = optionGroupsFor(brand, product.category);
    const counts = new Map<string, number>();
    const chosen = new Set<number>();
    const options = (item.choices ?? []).map(choice => {
      const option = byKey.get(cartItemKey(brand, choice.productId));
      if (!option?.available || !option.category || !allowed.includes(option.category) || chosen.has(option.id) ||
        !Number.isSafeInteger(option.priceCents) || option.priceCents < 0 ||
        !Number.isSafeInteger(choice.qty) || choice.qty < 1 || choice.qty > OPTION_GROUP_LIMIT) {
        throw new Error("Um adicional ficou indisponível. Revise as escolhas do item.");
      }
      chosen.add(option.id);
      const quantity = (counts.get(option.category) ?? 0) + choice.qty;
      if (quantity > OPTION_GROUP_LIMIT) throw new Error("Limite de adicionais excedido.");
      counts.set(option.category, quantity);
      return { productId: option.id, qty: choice.qty, name: option.name, priceCents: option.priceCents };
    });
    const notes = [...options.map(option => `${option.qty}× ${option.name}`), item.notes].filter(Boolean).join("; ");
    return { productId: product.id, brand, name: mixed ? `${BRANDS[brand]} · ${product.name}` : product.name,
      priceCents: product.priceCents + options.reduce((sum, option) => sum + option.qty * option.priceCents, 0),
      qty: item.qty, notes: notes || null,
      ...(options.length ? { choices: options, customerNotes: item.notes || null } : {}) };
  });
}
