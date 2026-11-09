import { IfoodApiError, assertLive, call } from "@/lib/ifood-api";
import type { IfoodStore } from "@/lib/ifood";
import { normalizeCatalog, validateShifts, type CatalogCategory, type Shift } from "@/lib/ifood-shapes";

export { DAYS, normalizeCatalog, validateShifts, type CatalogCategory, type CatalogItem, type Day, type Shift } from "@/lib/ifood-shapes";

// Operações de loja do iFood além dos pedidos: cardápio, horários, avaliações e financeiro.
// 403 = módulo não liberado para o app no portal do iFood; a tela mostra "sem permissão no iFood".

export const FORBIDDEN_MESSAGE: Record<string, string> = {
  catalog: "Sem permissão no iFood: o módulo Catalog não está liberado para o app desta loja.",
  merchant: "Sem permissão no iFood: o módulo Merchant não está liberado para o app desta loja.",
  review: "Sem permissão no iFood: o módulo Review não está liberado para o app desta loja.",
  financial: "Sem permissão no iFood: o módulo Financial não está liberado para o app desta loja.",
  order: "Sem permissão no iFood para esta ação de pedido.",
};

export function moduleError(error: unknown, module: keyof typeof FORBIDDEN_MESSAGE) {
  if (error instanceof IfoodApiError && error.status === 403) return new IfoodApiError(FORBIDDEN_MESSAGE[module], 403);
  return error;
}

const m = (store: IfoodStore) => encodeURIComponent(store.id);

// ── Cardápio ──────────────────────────────────────────────────────────────
export async function storeCatalog(store: IfoodStore) {
  try {
    const catalogs = (await call<{ catalogId: string; context?: string[]; status?: string }[]>(`/catalog/v2.0/merchants/${m(store)}/catalogs`)) ?? [];
    const main = catalogs.find(c => c.context?.includes("DEFAULT")) ?? catalogs[0];
    if (!main) return { catalogId: null, categories: [] as CatalogCategory[] };
    const raw = await call<unknown>(`/catalog/v2.0/merchants/${m(store)}/catalogs/${encodeURIComponent(main.catalogId)}/categories?includeItems=true`);
    return { catalogId: main.catalogId, categories: normalizeCatalog(raw) };
  } catch (error) { throw moduleError(error, "catalog"); }
}

export async function setItemAvailability(store: IfoodStore, itemId: string, available: boolean) {
  assertLive();
  try { await call(`/catalog/v2.0/merchants/${m(store)}/items/status`, { method: "PATCH", body: { itemId, status: available ? "AVAILABLE" : "UNAVAILABLE" } }); }
  catch (error) { throw moduleError(error, "catalog"); }
}

export async function setItemPrice(store: IfoodStore, itemId: string, priceCents: number, originalPriceCents?: number | null) {
  assertLive();
  const price: Record<string, number> = { value: priceCents / 100 };
  if (originalPriceCents && originalPriceCents > priceCents) price.originalValue = originalPriceCents / 100;
  try { await call(`/catalog/v2.0/merchants/${m(store)}/items/price`, { method: "PATCH", body: { itemId, price } }); }
  catch (error) { throw moduleError(error, "catalog"); }
}

// ── Horários ──────────────────────────────────────────────────────────────
export async function openingHours(store: IfoodStore) {
  try {
    const data = await call<{ shifts?: Shift[] }>(`/merchant/v1.0/merchants/${m(store)}/opening-hours`);
    return (data?.shifts ?? []).map(s => ({ dayOfWeek: s.dayOfWeek, start: String(s.start).slice(0, 5), duration: Number(s.duration) }));
  } catch (error) { throw moduleError(error, "merchant"); }
}

export async function saveOpeningHours(store: IfoodStore, shifts: Shift[]) {
  assertLive();
  const valid = validateShifts(shifts);
  try { await call(`/merchant/v1.0/merchants/${m(store)}/opening-hours`, { method: "PUT", body: { storeId: store.id, shifts: valid } }); }
  catch (error) { throw moduleError(error, "merchant"); }
}

// ── Avaliações ────────────────────────────────────────────────────────────
export async function reviews(store: IfoodStore, page = 1) {
  try {
    const [list, summary] = await Promise.all([
      call<Record<string, unknown>>(`/review/v2.0/merchants/${m(store)}/reviews?page=${page}&pageSize=20&addCount=true&sort=DESC&sortBy=CREATED_AT`),
      call<Record<string, unknown>>(`/review/v2.0/merchants/${m(store)}/summary`).catch(() => null),
    ]);
    return { list: list ?? {}, summary };
  } catch (error) { throw moduleError(error, "review"); }
}

export async function answerReview(store: IfoodStore, reviewId: string, text: string) {
  assertLive();
  const body = text.trim();
  if (body.length < 10 || body.length > 300) throw new IfoodApiError("A resposta precisa ter de 10 a 300 caracteres.", 422);
  try { return await call(`/review/v2.0/merchants/${m(store)}/reviews/${encodeURIComponent(reviewId)}/answers`, { method: "POST", body: { text: body } }); }
  catch (error) { throw moduleError(error, "review"); }
}

// ── Financeiro ────────────────────────────────────────────────────────────
export function validRange(from: string, to: string) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) throw new IfoodApiError("Datas no formato AAAA-MM-DD.", 422);
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (!(days >= 0) || days > 31) throw new IfoodApiError("Escolha um período de até 31 dias.", 422);
}

export async function financial(store: IfoodStore, from: string, to: string) {
  validRange(from, to);
  const q = (a: string, b: string) => `${a}=${from}&${b}=${to}`;
  const [sales, settlements] = await Promise.allSettled([
    call<unknown>(`/financial/v3.0/merchants/${m(store)}/sales?${q("beginSalesDate", "endSalesDate")}`),
    call<unknown>(`/financial/v3.0/merchants/${m(store)}/settlements?${q("beginPaymentDate", "endPaymentDate")}`),
  ]);
  const out = (r: PromiseSettledResult<unknown>) => r.status === "fulfilled"
    ? { data: r.value ?? [], error: null }
    : { data: null, error: (moduleError(r.reason, "financial") as Error).message ?? "Falha ao consultar o iFood." };
  return { sales: out(sales), settlements: out(settlements) };
}
