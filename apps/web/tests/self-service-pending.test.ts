import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePendingOrder, pendingOrderStorageKey, type PendingSelfServiceOrder } from "../src/lib/self-service-pending";

const context = { brand: "barbacue", channel: "kiosk" } as const;
const pending: PendingSelfServiceOrder = {
  payload: { ...context, requestId: "a67c42af-54ec-4439-9de7-ec94ca287e2b", customerName: "Ana", paymentMethod: "cash", items: [{ productId: 8, qty: 2, notes: "Sem cebola" }] },
  products: [{ id: 8, name: "Burger da casa", priceCents: 2790, imageUrl: null }],
};

test("recovery preserves the exact UUID and payload after a lost response", () => {
  const recovered = parsePendingOrder(JSON.stringify(pending), context);
  assert.deepEqual(recovered?.payload, pending.payload);
  assert.deepEqual(recovered?.products, pending.products);
});

test("pending requests never migrate between brands, channels or tables", () => {
  const raw = JSON.stringify(pending);
  assert.equal(parsePendingOrder(raw, { ...context, brand: "chelas" }), null);
  assert.equal(parsePendingOrder(raw, { ...context, channel: "table_qr" }), null);
  assert.equal(parsePendingOrder(raw, { ...context, tableToken: "2965725d-b80c-41e2-a5e5-fb2b5756c676" }), null);
  assert.notEqual(pendingOrderStorageKey(context), pendingOrderStorageKey({ ...context, brand: "chelas" }));
});

test("invalid recovery data cannot become a different automatic order", () => {
  assert.equal(parsePendingOrder("invalid json", context), null);
  assert.equal(parsePendingOrder(JSON.stringify({ ...pending, products: [] }), context), null);
  assert.equal(parsePendingOrder(JSON.stringify({ ...pending, payload: { ...pending.payload, requestId: "wrong" } }), context), null);
  assert.equal(parsePendingOrder(JSON.stringify({ ...pending, payload: { ...pending.payload, items: [{ productId: 8, qty: 0 }] } }), context), null);
  assert.equal(parsePendingOrder(JSON.stringify({ ...pending, payload: { ...pending.payload, items: [{ productId: 8, qty: 1, notes: "x".repeat(161) }] } }), context), null);
});
