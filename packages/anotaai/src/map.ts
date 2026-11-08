// Copiado de food.cog.ia.br src/lib/anotaai/map.ts (a2466d7). Mantenha os dois iguais.
// Funções puras (testáveis) de mapeamento Anota AI → Food COG.
// Documentação: https://integ-public-platform-docs.anota.ai/docs/integracao-parceiros/api-pedidos-v2

export type AnotaMoney = number | string | null | undefined;
export type AnotaSubItem = { name?: string; quantity?: number; price?: AnotaMoney; total?: AnotaMoney; totalPrice?: AnotaMoney; unitPrice?: AnotaMoney; externalCode?: string };
export type AnotaItem = { _id?: string; id?: number | string; name?: string; quantity?: number; price?: AnotaMoney; total?: AnotaMoney; observation?: string | null; externalId?: string; subItems?: AnotaSubItem[] };
export type AnotaPayment = { name?: string; code?: string; value?: AnotaMoney; cardSelected?: string; changeFor?: AnotaMoney; prepaid?: boolean };
export type AnotaOrder = {
  _id?: string; id?: string; check?: number; shortReference?: number | string; createdAt?: string; updatedAt?: string;
  type?: "DELIVERY" | "TAKE" | "LOCAL" | string; from?: string; salesChannel?: string; ifood_id?: string;
  observation?: string | null; qr_description?: string | null; table?: string;
  customer?: { id?: string | null; name?: string | null; phone?: string | null; taxPayerIdentificationNumber?: string | null };
  deliveryAddress?: { formattedAddress?: string; streetName?: string; streetNumber?: string; neighborhood?: string | null; city?: string; complement?: string; reference?: string; postalCode?: string };
  items?: AnotaItem[]; payments?: AnotaPayment[]; discounts?: Array<{ amount?: AnotaMoney; tag?: string }>;
  additionalFees?: Array<{ type?: string; description?: string; value?: AnotaMoney }>;
  deliveryFee?: AnotaMoney; total?: AnotaMoney;
  schedule_order?: { date?: string; start?: string; end?: string; timezone?: string } | null;
  pdv?: { status?: boolean; mode?: number; table?: string; ticket?: string };
  waiter_info?: { waiter_name?: string };
  order_automatic_accept?: boolean; main_order?: boolean;
};
export type AnotaListDoc = { _id: string; check: number; from?: string; salesChannel?: string; updatedAt?: string };

export const cents = (v: AnotaMoney) => { const n = typeof v === "string" ? Number(v.replace(",", ".")) : v || 0; return Number.isFinite(n) ? Math.round((n as number) * 100) : 0; };

/** check da Anota AI → status do Food COG. 6 (pedido de cancelamento) e desconhecidos não mudam o status. */
export function statusOfCheck(check: number | undefined | null): string | null {
  switch (check) {
    case 0: return "PENDING";
    case -2: return "CONFIRMED"; // agendado aceito
    case 1: return "CONFIRMED"; // em produção = aceito
    case 2: return "READY";
    case 3: return "DELIVERED";
    case 4: case 5: return "CANCELED"; // 5 = negado (não aceito em 15 min)
    default: return null;
  }
}
const RANK: Record<string, number> = { PENDING: 0, CONFIRMED: 1, PREPARING: 2, READY: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5 };
/** O status só avança; cancelamento sempre vale; pedidos encerrados não mudam. */
export function shouldApplyStatus(current: string, next: string) {
  if (next === current || current === "CANCELED" || current === "DELIVERED") return false;
  if (next === "CANCELED") return true;
  return (RANK[next] ?? -1) > (RANK[current] ?? -1);
}

/**
 * Ações da API de pedidos para levar o pedido ao status `to` do Food COG, dado o check atual na Anota AI.
 * accept (0→1), ready (1→2), finalize (2→3). Cancelamento é tratado à parte (exige justificativa).
 */
export function actionsFor(to: string, remoteCheck: number | null | undefined): Array<"accept" | "ready" | "finalize"> {
  const target = to === "CONFIRMED" || to === "PREPARING" ? 1 : to === "READY" || to === "OUT_FOR_DELIVERY" ? 2 : to === "DELIVERED" ? 3 : -1;
  if (target < 0) return [];
  let cur = remoteCheck === -2 ? 1 : remoteCheck ?? 0;
  if (cur < 0 || cur > 3) return [];
  const out: Array<"accept" | "ready" | "finalize"> = [];
  while (cur < target) { out.push(cur === 0 ? "accept" : cur === 1 ? "ready" : "finalize"); cur++; }
  return out;
}

/** O Token da loja no Portal de Integração é um JWT com o claim `idpage` (vai no header x-page-id). */
export function pageIdFromToken(token: string): string | null {
  const t = token.trim();
  if (/^[0-9a-f]{24}$/i.test(t)) return t; // já é o próprio idpage
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  try {
    const j = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { idpage?: string };
    return typeof j.idpage === "string" && j.idpage ? j.idpage : null;
  } catch { return null; }
}

const PAY_LABEL: Record<string, string> = { money: "Dinheiro", card: "Cartão", debit: "Débito", pix: "Pix", online: "Online", online_credit: "Crédito online", none: "A definir" };
const payLabel = (p: AnotaPayment) => PAY_LABEL[p.code || p.name || ""] || (p.name || p.code || "Pagamento").replace(/[-_]/g, " ");
const onlyDigits = (s?: string | null) => (s || "").replace(/\D/g, "");

export function mapAnotaOrder(o: AnotaOrder) {
  const id = String(o._id || o.id || "");
  const a = o.deliveryAddress;
  const addr = a?.formattedAddress || [a?.streetName, a?.streetNumber, a?.neighborhood, a?.city].filter(Boolean).join(", ");
  const payments = o.payments || [];
  const offline = payments.filter((p) => !p.prepaid && (p.code || p.name) !== "none");
  const cash = offline.find((p) => (p.code || p.name) === "money");
  const changeForCents = cash ? cents(cash.changeFor) : 0;
  const paymentMethod = !offline.length ? "EXTERNAL" :offline.length > 1 ? "MIXED" : cash ? "CASH" : (offline[0].code || offline[0].name) === "pix" ? "PIX" : "CARD_ON_DELIVERY";
  const discountCents = (o.discounts || []).reduce((s, d) => s + cents(d.amount), 0);
  const fees = (o.additionalFees || []).filter((f) => cents(f.value) > 0);
  const items = (o.items || []).map((i) => {
    const qty = i.quantity || 1;
    return {
      name: (i.name || "Item").replace(/^\./, "").trim(),
      quantity: qty,
      totalCents: cents(i.total ?? (cents(i.price) / 100) * qty),
      addons: (i.subItems || []).filter((s) => s.name).map((s) => `${s.quantity && s.quantity > 1 ? `${s.quantity}x ` : ""}${String(s.name).replace(/^\./, "").trim()}`),
      notes: i.observation || "",
    };
  });
  const subtotal = items.reduce((s, i) => s + i.totalCents, 0);
  const doc = onlyDigits(o.customer?.taxPayerIdentificationNumber);
  const sched = o.schedule_order?.date ? o.schedule_order : null;
  const tableLabel = o.pdv?.table || (o.type === "LOCAL" ? o.qr_description || null : null);
  const notes = [
    sched ? `AGENDADO ${sched.start && sched.end ? `entre ${sched.start} e ${sched.end}` : `para ${new Date(sched.date!).toLocaleString("pt-BR", { timeZone: sched.timezone || "America/Sao_Paulo" })}`}` : "",
    o.observation ? `Obs.: ${o.observation}` : "",
    ...payments.map((p) => `Pagamento: ${payLabel(p)}${p.cardSelected ? ` (${p.cardSelected})` : ""} R$ ${(cents(p.value) / 100).toFixed(2).replace(".", ",")} — ${p.prepaid ? "pago online" : "cobrar na entrega"}${(p.code || p.name) === "money" && cents(p.changeFor) ? ` · troco p/ R$ ${(cents(p.changeFor) / 100).toFixed(2).replace(".", ",")}` : ""}`),
    ...(o.discounts || []).filter((d) => cents(d.amount)).map((d) => `Desconto ${d.tag || ""}: -R$ ${(cents(d.amount) / 100).toFixed(2).replace(".", ",")}`.replace("  ", " ")),
    ...fees.map((f) => `${f.description || f.type}: R$ ${(cents(f.value) / 100).toFixed(2).replace(".", ",")}`),
    o.waiter_info?.waiter_name ? `Garçom: ${o.waiter_info.waiter_name}` : "",
    doc.length === 11 || doc.length === 14 ? `CPF/CNPJ na nota: ${doc}` : "",
  ].filter(Boolean).join(" · ");
  return {
    externalId: id,
    externalRef: o.shortReference != null ? String(o.shortReference) : null,
    fulfillment: (o.type === "TAKE" ? "PICKUP" : o.type === "LOCAL" ? "DINE_IN" : "DELIVERY") as "DELIVERY" | "PICKUP" | "DINE_IN",
    customerName: o.customer?.name && o.customer.name !== "Não identificado" ? o.customer.name : "",
    customerPhone: onlyDigits(o.customer?.phone).length >= 10 ? (onlyDigits(o.customer?.phone).startsWith("55") ? onlyDigits(o.customer?.phone) : `55${onlyDigits(o.customer?.phone)}`) : "",
    addressText: o.type === "DELIVERY" ? [addr, a?.complement, a?.reference ? `ref.: ${a.reference}` : ""].filter(Boolean).join(" — ") : "",
    district: a?.neighborhood || "",
    items,
    subtotalCents: subtotal,
    deliveryFeeCents: cents(o.deliveryFee),
    discountCents,
    totalCents: cents(o.total) || subtotal + cents(o.deliveryFee) - discountCents,
    paymentLabel: payments.map(payLabel).join(", "),
    createdAt: o.createdAt ? new Date(o.createdAt) : undefined,
    prepaid: payments.length > 0 && payments.every((p) => p.prepaid),
    paymentMethod,
    changeForCents,
    cpfNota: doc.length === 11 || doc.length === 14 ? doc : "",
    tableLabel,
    notes,
    ifoodId: o.ifood_id || null,
  };
}
