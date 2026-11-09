// Disputas, código de entrega, cardápio e horários do gestor iFood (regras puras).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDisputes, deliveryCodeTimeline, disputeRequest, type EventRow } from "../src/lib/ifood-disputes";
import { normalizeCatalog, validateShifts } from "../src/lib/ifood-shapes";

const hsd = (over: Partial<EventRow> = {}, meta: Record<string, unknown> = {}): EventRow => ({
  id: "e1", orderExternalId: "order-1", merchantId: "m1", brand: "barbacue", code: "HSD", fullCode: "HANDSHAKE_DISPUTE", disputeId: "d1",
  createdAt: "2026-11-09T12:00:00Z",
  payload: { metadata: { disputeId: "d1", action: "PARTIAL_CANCELLATION", message: "Faltou a batata", expiresAt: "2026-11-09T12:05:00Z", timeoutAction: "ACCEPT",
    alternatives: [
      { id: "alt-refund", type: "REFUND", metadata: { maxAmount: { value: 12.5, currency: "BRL" } } },
      { id: "alt-time", type: "ADDITIONAL_TIME", metadata: { allowedsAdditionalTimeInMinutes: [10, 20], allowedsAdditionalTimeReasons: ["HIGH_STORE_DEMAND"] } },
    ], metadata: { items: [{ name: "Batata", quantity: 1 }] }, ...meta } },
  ...over,
});
const now = Date.parse("2026-11-09T12:01:00Z");

test("HSD abre a disputa com alternativas, itens e prazo", () => {
  const [d] = buildDisputes([hsd()], now);
  assert.equal(d.status, "open");
  assert.equal(d.alternatives[0].maxAmountCents, 1250);
  assert.deepEqual(d.alternatives[1].additionalTimes, [10, 20]);
  assert.deepEqual(d.items, [{ name: "Batata", qty: 1 }]);
});

test("HSS encerra, ação local marca respondida e prazo vencido expira", () => {
  const settled = { ...hsd({ id: "e2", code: "HSS", createdAt: "2026-11-09T12:02:00Z" }), payload: { metadata: { disputeId: "d1", status: "ACCEPTED" } } };
  assert.equal(buildDisputes([hsd(), settled], now)[0].status, "settled");
  const local = { ...hsd({ id: "local:d1", code: "LOCAL_DISPUTE", createdAt: "2026-11-09T12:01:30Z" }), payload: { action: "accept" } };
  assert.equal(buildDisputes([hsd(), local], now)[0].status, "answered");
  assert.equal(buildDisputes([hsd()], Date.parse("2026-11-09T12:06:00Z"))[0].status, "expired");
});

test("respostas montam o corpo certo e respeitam os limites do iFood", () => {
  const [d] = buildDisputes([hsd()], now);
  assert.deepEqual(disputeRequest(d, { kind: "accept" }), { path: "/order/v1.0/disputes/d1/accept", body: {} });
  assert.throws(() => disputeRequest(d, { kind: "reject" }), /motivo/);
  assert.deepEqual(disputeRequest(d, { kind: "reject", reason: "Item enviado" }).body, { reason: "Item enviado" });
  const refund = disputeRequest(d, { kind: "alternative", alternativeId: "alt-refund", amountCents: 1000 });
  assert.equal(refund.path, "/order/v1.0/disputes/d1/alternatives/alt-refund");
  assert.deepEqual(refund.body, { type: "REFUND", metadata: { amount: { value: "10.00", currency: "BRL" } } });
  assert.throws(() => disputeRequest(d, { kind: "alternative", alternativeId: "alt-refund", amountCents: 1300 }), /limite/);
  assert.deepEqual(disputeRequest(d, { kind: "alternative", alternativeId: "alt-time", minutes: 20 }).body,
    { type: "ADDITIONAL_TIME", metadata: { additionalTimeInMinutes: "20", additionalTimeReason: "HIGH_STORE_DEMAND" } });
  assert.throws(() => disputeRequest(d, { kind: "alternative", alternativeId: "alt-time", minutes: 15 }), /tempos/);
  assert.throws(() => disputeRequest(d, { kind: "alternative", alternativeId: "outra" }), /não oferecida/);
});

test("código de entrega mostra o último evento de cada pedido", () => {
  const base = { merchantId: "m1", brand: "chelas", fullCode: null, disputeId: null, payload: {} };
  const timeline = deliveryCodeTimeline([
    { ...base, id: "a", orderExternalId: "o1", code: "DDCR", createdAt: "2026-11-09T10:00:00Z" },
    { ...base, id: "b", orderExternalId: "o1", code: "DDCS", createdAt: "2026-11-09T10:20:00Z" },
    { ...base, id: "c", orderExternalId: "o2", code: "PLC", createdAt: "2026-11-09T10:30:00Z" },
  ]);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].code, "DDCS");
});

test("cardápio normaliza preços em centavos e descarta itens sem id", () => {
  const [c] = normalizeCatalog([{ id: "c1", name: "Burgers", items: [{ id: "i1", name: "X", status: "UNAVAILABLE", price: { value: 32.9, originalValue: 39.9 } }, { name: "sem id" }] }]);
  assert.equal(c.items.length, 1);
  assert.deepEqual([c.items[0].priceCents, c.items[0].originalPriceCents, c.items[0].status], [3290, 3990, "UNAVAILABLE"]);
  assert.deepEqual(normalizeCatalog(null), []);
});

test("horários validam formato, duração e limite por dia", () => {
  assert.deepEqual(validateShifts([{ dayOfWeek: "FRIDAY", start: "18:00", duration: 360 }]), [{ dayOfWeek: "FRIDAY", start: "18:00:00", duration: 360 }]);
  assert.throws(() => validateShifts([{ dayOfWeek: "FRIDAY", start: "25:00", duration: 60 }]), /HH:mm/);
  assert.throws(() => validateShifts([{ dayOfWeek: "FRIDAY", start: "18:00", duration: 0 }]), /Duração/);
});
