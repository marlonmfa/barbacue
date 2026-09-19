import assert from "node:assert/strict";
import test from "node:test";
import { checkoutAmounts, deliveryEstimate, parseCheckoutQuote, quoteMatchesAddress } from "../src/lib/delivery-checkout.ts";
import { formToSettings, settingsToForm } from "../src/lib/delivery-settings-form.ts";

const response = () => ({ quoteId: "quote-test", address: "Rua da Brasa, 123, Centro", feeCents: 850, distanceMeters: 2500, durationSeconds: 601, expiresAt: new Date(Date.now() + 900000).toISOString(), provider: "osm" });

test("desconto cobre somente itens e troco deve considerar frete", () => {
  assert.deepEqual(checkoutAmounts(5000, 1000, 850), { subtotal: 5000, discount: 1000, deliveryFee: 850, total: 4850 });
  assert.equal(checkoutAmounts(5000, 9999, 850).total, 850);
  assert.equal(checkoutAmounts(5000, 1000).total, 4000);
});

test("alteração de endereço/marca e expiração invalidam frete", () => {
  const quote = parseCheckoutQuote(response(), " Rua da Brasa, 123 ", "barbacue");
  assert(quoteMatchesAddress(quote, "Rua da Brasa, 123", "barbacue"));
  assert.equal(quoteMatchesAddress(quote, "Rua da Brasa, 124", "barbacue"), false);
  assert.equal(quoteMatchesAddress(quote, "Rua da Brasa, 123", "chelas"), false);
  assert.equal(quoteMatchesAddress(quote, quote.requestedAddress, quote.brand, Date.parse(quote.expiresAt)), false);
  assert(!quoteMatchesAddress(null, quote.requestedAddress, quote.brand));
});

test("provider offline ou resposta malformada nunca viram frete grátis", () => {
  for (const invalid of [null, {}, { ...response(), feeCents: null }, { ...response(), feeCents: -1 }, { ...response(), durationSeconds: "30" }, { ...response(), expiresAt: "invalid" }, { ...response(), expiresAt: new Date(0).toISOString() }]) {
    assert.throws(() => parseCheckoutQuote(invalid, "Rua da Brasa, 123", "barbacue"));
  }
  assert.equal(parseCheckoutQuote({ ...response(), feeCents: 0 }, "Rua da Brasa, 123", "barbacue").feeCents, 0);
  assert.equal(deliveryEstimate(2500, 601), "2,5 km · cerca de 11 min de trajeto");
});

test("formulário mantém centavos e converte quilômetros sem presumir tarifa", () => {
  const saved = { enabled: true, provider: "osm" as const, originAddress: "Rua da Loja, 1", originLatitude: -26.48, originLongitude: -49.08, baseFeeCents: 250, feePerKmCents: 175, minFeeCents: 500, maxDistanceMeters: 12500 };
  const form = settingsToForm(saved);
  assert.equal(form.baseFee, "2,50");
  assert.equal(form.maxDistance, "12,5");
  assert.deepEqual(formToSettings(form), saved);
  assert.throws(() => formToSettings({ ...form, feePerKm: "1.750" }), /separador de milhar/);
  assert.throws(() => formToSettings({ ...form, baseFee: "-1" }), /número positivo/);
  assert.throws(() => formToSettings({ ...form, latitude: "-91" }), /fora do limite/);
  assert.throws(() => formToSettings({ ...form, latitude: "" }), /Localize/);
  assert.throws(() => formToSettings({ ...form, maxDistance: "0" }), /distância máxima/);
  assert.equal(formToSettings({ ...form, enabled: false, originAddress: "", latitude: "", longitude: "" }).enabled, false);
});
