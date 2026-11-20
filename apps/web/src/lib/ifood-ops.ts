import { IfoodApiError, assertLive, call } from "@/lib/ifood-api";
import type { IfoodStore } from "@/lib/ifood";
import { normalizeCatalog, type CatalogCategory } from "@/lib/ifood-shapes";

const FORBIDDEN_MESSAGE = "Sem permissão no iFood: o módulo Catalog não está liberado para o app desta loja.";

function moduleError(error: unknown) {
  if (error instanceof IfoodApiError && error.status === 403) return new IfoodApiError(FORBIDDEN_MESSAGE, 403);
  return error;
}

const m = (store: IfoodStore) => encodeURIComponent(store.id);

// ── Cardápio ──────────────────────────────────────────────────────────────
export async function storeCatalog(store: IfoodStore) {
  try {
    const catalogs = (await call<{ catalogId: string; context?: string[]; status?: string }[]>(`/catalog/v2.0/merchants/${m(store)}/catalogs`)) ?? [];
    const main = catalogs.find(c => c.context?.includes("DEFAULT")) ?? catalogs[0];
    if (!main?.catalogId) return { catalogId: null, categories: [] as CatalogCategory[] };
    const raw = await call<unknown>(`/catalog/v2.0/merchants/${m(store)}/catalogs/${encodeURIComponent(main.catalogId)}/categories?includeItems=true`);
    return { catalogId: main.catalogId, categories: normalizeCatalog(raw) };
  } catch (error) { throw moduleError(error); }
}

export async function setItemAvailability(store: IfoodStore, itemId: string, available: boolean) {
  assertLive();
  try { await call(`/catalog/v2.0/merchants/${m(store)}/items/status`, { method: "PATCH", requireResource: true, body: { itemId, status: available ? "AVAILABLE" : "UNAVAILABLE" } }); }
  catch (error) { throw moduleError(error); }
}

export async function setItemPrice(store: IfoodStore, itemId: string, priceCents: number, originalPriceCents?: number | null) {
  assertLive();
  const price: Record<string, number> = { value: priceCents / 100 };
  if (originalPriceCents && originalPriceCents > priceCents) price.originalValue = originalPriceCents / 100;
  try { await call(`/catalog/v2.0/merchants/${m(store)}/items/price`, { method: "PATCH", requireResource: true, body: { itemId, price } }); }
  catch (error) { throw moduleError(error); }
}
