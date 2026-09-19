import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalSelfServiceItems, selfServiceOrderSchema, selfServiceRequestHash } from "../self-service.ts";
import { printFailureStatus, printRetryDelaySeconds, validPrintAgentAuthorization } from "../kitchen-print.ts";

const input = { requestId: "11111111-1111-4111-8111-111111111111", channel: "kiosk", brand: "barbacue", customerName: "Cliente", paymentMethod: "cash", items: [{ productId: 1, qty: 2, notes: "Sem cebola" }] };

test("self-service rejects missing table credentials, excessive quantities and printer controls", () => {
  assert(selfServiceOrderSchema.safeParse(input).success);
  assert.equal(selfServiceOrderSchema.parse({ ...input, requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }).requestId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert(!selfServiceOrderSchema.safeParse({ ...input, channel: "table_qr" }).success);
  assert(!selfServiceOrderSchema.safeParse({ ...input, customerName: " " }).success);
  assert(!selfServiceOrderSchema.safeParse({ ...input, notes: "Teste\x1b@" }).success);
  assert(!selfServiceOrderSchema.safeParse({ ...input, items: [{ productId: 1, qty: 21 }] }).success);
  assert(!selfServiceOrderSchema.safeParse({ ...input, items: Array.from({ length: 6 }, () => ({ productId: 1, qty: 20 })) }).success);
  assert(!selfServiceOrderSchema.safeParse({ ...input, items: [{ productId: 1, qty: 2, priceCents: 1 }] }).success);
});

test("retry hash is canonical and binds quantities, table and per-item notes", () => {
  const parsed = selfServiceOrderSchema.parse(input);
  const reordered = selfServiceOrderSchema.parse({ notes: "  ", ...input, items: [{ notes: " Sem cebola ", qty: 2, productId: 1 }] });
  assert.equal(selfServiceRequestHash(parsed), selfServiceRequestHash(reordered));
  assert.notEqual(selfServiceRequestHash(parsed), selfServiceRequestHash({ ...parsed, items: [{ ...parsed.items[0], qty: 3 }] }));
  assert.notEqual(selfServiceRequestHash(parsed), selfServiceRequestHash({ ...parsed, items: [{ ...parsed.items[0], notes: "Com cebola" }] }));
  assert.notEqual(selfServiceRequestHash(parsed), selfServiceRequestHash({ ...parsed, tableToken: "11111111-1111-4111-8111-111111111117" }));
});

test("items and prices come from the available server catalog, preserving preparation notes", () => {
  const products = [{ id: 1, name: "Burger", priceCents: 2250, available: true }];
  const items = canonicalSelfServiceItems(selfServiceOrderSchema.parse(input).items, products);
  assert.deepEqual(items, [{ productId: 1, name: "Burger", priceCents: 2250, qty: 2, notes: "Sem cebola" }]);
  assert.throws(() => canonicalSelfServiceItems([{ productId: 1, qty: 1 }], [{ ...products[0], available: false }]), /indisponível/);
  assert.throws(() => canonicalSelfServiceItems([{ productId: 99, qty: 1 }], products), /indisponível/);
});

test("printer authentication is dedicated and uncertain writes never auto-retry", () => {
  const token = "random-dedicated-print-token-20260907";
  assert(validPrintAgentAuthorization(`Bearer ${token}`, token));
  assert(!validPrintAgentAuthorization(`Bearer ${token}x`, token));
  assert(!validPrintAgentAuthorization("Bearer short", "short"));
  assert(!validPrintAgentAuthorization(null, token));
  assert.equal(printFailureStatus(1, true), "uncertain");
  assert.equal(printFailureStatus(1, false), "queued");
  assert.equal(printFailureStatus(5, false), "failed");
  assert(printRetryDelaySeconds(4) > printRetryDelaySeconds(1));
});
