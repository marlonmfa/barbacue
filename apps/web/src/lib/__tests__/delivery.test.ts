import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeliveryRouteLinks, calculateDeliveryFee, deliveryAddressKey, deliveryQuoteRequestSchema, deliverySettingsSchema } from "../delivery.ts";

const pricing = { baseFeeCents: 300, feePerKmCents: 120, minFeeCents: 500, maxDistanceMeters: 10_000 };
test("delivery fee uses route meters, fractional kilometers, cent rounding and minimum", () => {
  assert.equal(calculateDeliveryFee(3750, pricing), 750);
  assert.equal(calculateDeliveryFee(10, pricing), 500);
  assert.equal(calculateDeliveryFee(1001, { ...pricing, minFeeCents: 0, feePerKmCents: 199 }), 499);
  assert.equal(calculateDeliveryFee(10_000, pricing), 1500);
  assert.throws(() => calculateDeliveryFee(10_001, pricing), /fora da área/);
  for (const value of [-1, NaN, Infinity, 0.3]) assert.throws(() => calculateDeliveryFee(value, pricing), /tarifa válida/);
});

test("address identity tolerates accents and spacing while retaining number and apartment", () => {
  assert.equal(deliveryAddressKey("  Rua São José,   123  "), deliveryAddressKey("rua sao jose, 123"));
  assert.notEqual(deliveryAddressKey("Rua São José, 123 apto 1"), deliveryAddressKey("Rua São José, 123 apto 2"));
  assert(!deliveryQuoteRequestSchema.safeParse({ address: "São Paulo", brand: "barbacue" }).success);
  assert(!deliveryQuoteRequestSchema.safeParse({ address: "Rua Teste, 123\nSão Paulo", brand: "barbacue" }).success);
  assert(!deliveryQuoteRequestSchema.safeParse({ address: "Rua Teste, 123, São Paulo", brand: "barbacue", feeCents: 0 }).success);
});

test("activation requires coordinates, an address and an intentional delivery tariff", () => {
  const config = { enabled: false, provider: "osm", originAddress: null, originLatitude: null, originLongitude: null, ...pricing };
  assert(deliverySettingsSchema.safeParse(config).success);
  assert(!deliverySettingsSchema.safeParse({ ...config, enabled: true }).success);
  assert(!deliverySettingsSchema.safeParse({ ...config, originLatitude: -23 }).success);
  const ready = { ...config, enabled: true, originAddress: "Rua Teste, 123, São Paulo", originLatitude: -23.55, originLongitude: -46.63 };
  assert(deliverySettingsSchema.safeParse(ready).success);
  assert(!deliverySettingsSchema.safeParse({ ...ready, baseFeeCents: 0, feePerKmCents: 0, minFeeCents: 0 }).success);
  assert(!deliverySettingsSchema.safeParse({ ...ready, originLatitude: 100 }).success);
});

test("navigation links encode latitude/longitude without placing a secret in URLs", () => {
  const links = buildDeliveryRouteLinks({ latitude: -23.55, longitude: -46.63 }, { latitude: -23.56, longitude: -46.65 });
  assert.equal(new URL(links.google).searchParams.get("origin"), "-23.55,-46.63");
  assert.equal(new URL(links.google).searchParams.get("destination"), "-23.56,-46.65");
  assert.equal(new URL(links.apple).searchParams.get("dirflg"), "d");
  assert.equal(new URL(links.osm).searchParams.get("route"), "-23.55,-46.63;-23.56,-46.65");
  assert(Object.values(links).every(value => value.startsWith("https://") && !value.includes("key=")));
});
