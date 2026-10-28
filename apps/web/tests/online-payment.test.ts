import { test } from "node:test";
import assert from "node:assert/strict";
import { asaasPaymentState, assertPaymentMatches, onlineOrderSchema, paymentReference, secureEquals, tokenHash, validCpf } from "../src/lib/online-payment.ts";

const id = "8d3f7436-3f4f-4b8c-9477-b523e79ad434";
const input = { requestId: id, accessToken: "a".repeat(64), brand: "barbacue", customerName: "Cliente Teste", customerPhone: "(47) 99999-9999", cpf: "529.982.247-25", orderType: "pickup", items: [{ productId: 1, qty: 2, notes: "Sem cebola" }] };
test("checkout validates CPF, quantities, mandatory table/address and untrusted price fields", () => {
  assert(validCpf("52998224725")); assert(!validCpf("11111111111")); assert(!validCpf("52998224726"));
  const parsed = onlineOrderSchema.parse(input); assert.equal(parsed.cpf, "52998224725"); assert.equal(parsed.customerPhone, "47999999999");
  assert(!onlineOrderSchema.safeParse({ ...input, items: [{ productId: 1, qty: 0 }] }).success);
  assert(!onlineOrderSchema.safeParse({ ...input, items: [{ productId: 1, qty: 21 }] }).success);
  assert(!onlineOrderSchema.safeParse({ ...input, items: [{ productId: 1, qty: 1, priceCents: 1 }] }).success);
  assert(!onlineOrderSchema.safeParse({ ...input, orderType: "dine_in" }).success);
  assert(!onlineOrderSchema.safeParse({ ...input, orderType: "delivery", deliveryAddress: "Rua" }).success);
  assert(!onlineOrderSchema.safeParse({ ...input, paymentStatus: "paid" }).success);
});
test("release requires a settled provider status; chargebacks, deletion and refunds fail closed", () => {
  for (const status of ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS", "RECEIVED_IN_CASH", "UNKNOWN"]) assert.equal(asaasPaymentState({ status }), "pending");
  for (const status of ["RECEIVED", "CONFIRMED"]) assert.equal(asaasPaymentState({ status }), "paid");
  for (const status of ["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"]) assert.equal(asaasPaymentState({ status }), "failed");
  assert.equal(asaasPaymentState({ status: "RECEIVED", deleted: true }), "failed");
});
test("provider payment must bind exact order, amount, customer, method and payment id", () => {
  const expected = { paymentId: "pay_123", orderId: id, totalCents: 4590, customerId: "cus_123" };
  const payment = { id: "pay_123", customer: "cus_123", value: 45.9, externalReference: paymentReference(id), billingType: "PIX", status: "RECEIVED" };
  assert.doesNotThrow(() => assertPaymentMatches(payment, expected));
  for (const patch of [{ id: "pay_other" }, { customer: "cus_other" }, { value: 45.89 }, { value: Number.NaN }, { externalReference: "e26:another" }, { billingType: "BOLETO" }]) assert.throws(() => assertPaymentMatches({ ...payment, ...patch }, expected));
});
test("checkout capabilities compare full digests", () => {
  assert(secureEquals(tokenHash("a".repeat(64)), tokenHash("a".repeat(64))));
  assert(!secureEquals(tokenHash("a".repeat(64)), tokenHash("b".repeat(64))));
  assert(!secureEquals("short", "longer"));
});
