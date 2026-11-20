// Formatos e validações puras do iFood, usados no servidor e nas telas (sem rede).

export interface CatalogItem { id: string; name: string; status: string; priceCents: number | null; originalPriceCents: number | null; externalCode: string | null }
export interface CatalogCategory { id: string; name: string; status: string; items: CatalogItem[] }

const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null);

export function normalizeCatalog(raw: unknown): CatalogCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: Record<string, unknown>) => ({
    id: String(c.id ?? ""), name: String(c.name ?? "Categoria"), status: String(c.status ?? "AVAILABLE"),
    items: (Array.isArray(c.items) ? c.items : []).map((i: Record<string, unknown>) => {
      const price = (i.price ?? {}) as Record<string, unknown>;
      return {
        id: String(i.id ?? ""), name: String(i.name ?? (i.product as Record<string, unknown> | undefined)?.name ?? "Item"),
        status: String(i.status ?? "AVAILABLE"), priceCents: cents(price.value), originalPriceCents: cents(price.originalValue),
        externalCode: typeof i.externalCode === "string" ? i.externalCode : null,
      };
    }).filter(i => i.id),
  })).filter(c => c.id);
}
