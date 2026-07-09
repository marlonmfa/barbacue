// Unit tests for parseReais — the inline price editor's string→cents parser.
// Regression guard for the 100x-inflation bug: the editor seeds the draft as
// "12,90"/"12.90", and a naive dot-stripping parser turned that into 1290 cents
// worth of *reais* (R$1.290). These pin the correct behavior.
//
//   ../../node_modules/.bin/tsx --test tests/pricing.test.ts
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReais } from "../src/lib/pricing";

test("parseReais: the exact regression — seeded dot decimals stay put", () => {
  assert.equal(parseReais("12.90"), 1290);   // was catastrophically 129000
  assert.equal(parseReais("77.77"), 7777);
  assert.equal(parseReais("9.99"), 999);
});

test("parseReais: pt-BR comma decimals", () => {
  assert.equal(parseReais("12,90"), 1290);
  assert.equal(parseReais("0,50"), 50);
  assert.equal(parseReais("R$ 34,00"), 3400);
});

test("parseReais: grouped thousands in both conventions", () => {
  assert.equal(parseReais("1.234,56"), 123456); // pt-BR
  assert.equal(parseReais("1,234.56"), 123456); // en
  assert.equal(parseReais("R$ 1.299,90"), 129990);
});

test("parseReais: a lone dot with 3 trailing digits is thousands (pt-BR)", () => {
  assert.equal(parseReais("1.500"), 150000); // R$1.500, not R$1,50
  assert.equal(parseReais("12.000"), 1200000);
});

test("parseReais: whole reais without separators", () => {
  assert.equal(parseReais("15"), 1500);
  assert.equal(parseReais("100"), 10000);
});

test("parseReais: unparseable input → NaN", () => {
  assert.equal(Number.isNaN(parseReais("")), true);
  assert.equal(Number.isNaN(parseReais("abc")), true);
  assert.equal(Number.isNaN(parseReais("R$")), true);
});

test("parseReais: round-trips the price the editor seeds (toFixed→comma)", () => {
  // startEdit seeds fmt(cents) = (cents/100).toFixed(2).replace(".", ",").
  for (const cents of [50, 999, 1290, 3400, 129990, 1200000]) {
    const seeded = (cents / 100).toFixed(2).replace(".", ",");
    assert.equal(parseReais(seeded), cents, `round-trip ${cents} via "${seeded}"`);
  }
});
