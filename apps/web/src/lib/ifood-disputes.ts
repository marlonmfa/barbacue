// Regras puras das disputas (negociação) e do código de entrega do iFood. Sem rede nem banco.
// Os eventos chegam pelo monitor (packages/ifood) e ficam em ifood_order_events.

export type DisputeKind = "accept" | "reject" | "alternative";
export interface DisputeAlternative {
  id: string; type: string;
  maxAmountCents: number | null;
  additionalTimes: number[];
  additionalTimeReasons: string[];
}
export interface Dispute {
  disputeId: string; orderExternalId: string; merchantId: string | null; brand: string | null;
  action: string | null; message: string | null; handshakeType: string | null;
  expiresAt: string | null; timeoutAction: string | null; createdAt: string;
  alternatives: DisputeAlternative[];
  items: { name: string; qty: number | null }[];
  status: "open" | "settled" | "answered" | "expired";
  settlement: string | null; localAction: string | null;
}
export interface EventRow {
  id: string; orderExternalId: string; merchantId: string | null; brand: string | null;
  code: string; fullCode: string | null; disputeId: string | null; payload: Record<string, unknown>; createdAt: string | Date;
}

export const ACTION_LABEL: Record<string, string> = {
  CANCELLATION: "Cliente pede cancelamento total",
  PARTIAL_CANCELLATION: "Cliente pede cancelamento parcial",
  PROPOSED_AMOUNT_REFUND: "Cliente pede reembolso de valor",
};
export const ALTERNATIVE_LABEL: Record<string, string> = {
  REFUND: "Oferecer reembolso parcial",
  BENEFIT: "Oferecer benefício (cupom)",
  ADDITIONAL_TIME: "Pedir mais tempo de entrega",
};
export const DELIVERY_CODE_LABEL: Record<string, string> = {
  DDCR: "Código de entrega solicitado ao cliente",
  DDCS: "Código de entrega validado",
  DDCF: "Código de entrega recusado",
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : v);

/** Valor em centavos de { value, currency } (value em reais) ou número em reais. */
export function amountCents(v: unknown): number | null {
  const raw = typeof v === "number" || typeof v === "string" ? v : obj(v).value;
  const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function parseAlternatives(v: unknown): DisputeAlternative[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap(item => {
    const a = obj(item); const id = str(a.id); const type = str(a.type);
    if (!id || !type) return [];
    const m = obj(a.metadata);
    const times = (Array.isArray(m.allowedsAdditionalTimeInMinutes) ? m.allowedsAdditionalTimeInMinutes : [])
      .map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 240);
    const reasons = (Array.isArray(m.allowedsAdditionalTimeReasons) ? m.allowedsAdditionalTimeReasons : []).filter((r): r is string => typeof r === "string");
    return [{ id, type, maxAmountCents: amountCents(m.maxAmount), additionalTimes: times, additionalTimeReasons: reasons }];
  });
}

/** Junta HSD (abertura), HSS (resultado) e ações locais em disputas, das mais novas para as mais antigas. */
export function buildDisputes(rows: EventRow[], now = Date.now()): Dispute[] {
  const byId = new Map<string, Dispute>();
  const sorted = [...rows].sort((a, b) => Date.parse(iso(a.createdAt)) - Date.parse(iso(b.createdAt)));
  for (const row of sorted) {
    const meta = obj(row.payload.metadata);
    const disputeId = row.disputeId ?? str(meta.disputeId);
    if (!disputeId) continue;
    if (row.code === "HSD") {
      const inner = obj(meta.metadata);
      const items = (Array.isArray(inner.items) ? inner.items : []).map(i => { const x = obj(i); return { name: str(x.name) ?? str(x.description) ?? "Item", qty: typeof x.quantity === "number" ? x.quantity : null }; });
      byId.set(disputeId, {
        disputeId, orderExternalId: row.orderExternalId, merchantId: row.merchantId, brand: row.brand,
        action: str(meta.action), message: str(meta.message), handshakeType: str(meta.handshakeType),
        expiresAt: str(meta.expiresAt), timeoutAction: str(meta.timeoutAction), createdAt: iso(row.createdAt),
        alternatives: parseAlternatives(meta.alternatives), items, status: "open", settlement: null, localAction: null,
      });
    } else {
      const d = byId.get(disputeId);
      if (!d) continue;
      if (row.code === "HSS") { d.status = "settled"; d.settlement = str(meta.status) ?? str(meta.type) ?? "Resolvida"; }
      else if (row.code === "LOCAL_DISPUTE" && d.status === "open") { d.status = "answered"; d.localAction = str(row.payload.action); }
    }
  }
  for (const d of byId.values()) if (d.status === "open" && d.expiresAt && Date.parse(d.expiresAt) < now) d.status = "expired";
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Corpo do POST ao iFood para cada resposta, validado contra a alternativa oferecida. */
export function disputeRequest(dispute: Pick<Dispute, "disputeId" | "alternatives">, input: { kind: DisputeKind; reason?: string; alternativeId?: string; amountCents?: number; minutes?: number; timeReason?: string }) {
  const id = encodeURIComponent(dispute.disputeId);
  if (input.kind === "accept") return { path: `/order/v1.0/disputes/${id}/accept`, body: input.reason ? { reason: input.reason } : {} };
  if (input.kind === "reject") {
    if (!input.reason?.trim()) throw new Error("Informe o motivo da recusa.");
    return { path: `/order/v1.0/disputes/${id}/reject`, body: { reason: input.reason.trim() } };
  }
  const alt = dispute.alternatives.find(a => a.id === input.alternativeId);
  if (!alt) throw new Error("Alternativa não oferecida pelo iFood nesta disputa.");
  const path = `/order/v1.0/disputes/${id}/alternatives/${encodeURIComponent(alt.id)}`;
  if (alt.type === "ADDITIONAL_TIME") {
    if (!input.minutes || (alt.additionalTimes.length && !alt.additionalTimes.includes(input.minutes))) throw new Error("Escolha um dos tempos permitidos pelo iFood.");
    const reason = input.timeReason ?? alt.additionalTimeReasons[0];
    if (!reason || (alt.additionalTimeReasons.length && !alt.additionalTimeReasons.includes(reason))) throw new Error("Escolha um dos motivos permitidos pelo iFood.");
    return { path, body: { type: alt.type, metadata: { additionalTimeInMinutes: String(input.minutes), additionalTimeReason: reason } } };
  }
  const cents = input.amountCents ?? alt.maxAmountCents;
  if (!cents || !Number.isSafeInteger(cents) || cents <= 0 || (alt.maxAmountCents != null && cents > alt.maxAmountCents)) throw new Error("Valor fora do limite permitido pelo iFood.");
  return { path, body: { type: alt.type, metadata: { amount: { value: (cents / 100).toFixed(2), currency: "BRL" } } } };
}

/** Linha do histórico de código de entrega de cada pedido (último evento). */
export function deliveryCodeTimeline(rows: EventRow[]) {
  const latest = new Map<string, EventRow>();
  for (const r of rows) if (r.code in DELIVERY_CODE_LABEL) {
    const cur = latest.get(r.orderExternalId);
    if (!cur || Date.parse(iso(r.createdAt)) >= Date.parse(iso(cur.createdAt))) latest.set(r.orderExternalId, r);
  }
  return [...latest.values()].map(r => ({ orderExternalId: r.orderExternalId, brand: r.brand, code: r.code, label: DELIVERY_CODE_LABEL[r.code], at: iso(r.createdAt) }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
