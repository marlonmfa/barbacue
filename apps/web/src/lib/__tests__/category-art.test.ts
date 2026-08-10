// Unit test for the category → fallback-art mapping (the redesign's "no missing
// images" guarantee). Run: node --test src/lib/__tests__/category-art.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { artKeyFor, fallbackArt } from "../category-art.ts";

test("known slugs map to the expected art key", () => {
  assert.equal(artKeyFor("hamburgueres"), "burger");
  assert.equal(artKeyFor("hamburguer-vegetariano"), "burger");
  assert.equal(artKeyFor("acompanhamentos"), "sides");
  assert.equal(artKeyFor("molhos"), "sauce");
  assert.equal(artKeyFor("adicionais"), "sauce");
  assert.equal(artKeyFor("bebidas-delivery"), "drink");
  assert.equal(artKeyFor("cervejas-stannis"), "beer");
  assert.equal(artKeyFor("vinhos"), "beer");
  assert.equal(artKeyFor("drinks"), "cocktail");
  assert.equal(artKeyFor("sobremesas"), "dessert");
  assert.equal(artKeyFor("combos-individuais"), "combo");
});

test("unknown slug falls back to keyword heuristic on slug+name", () => {
  assert.equal(artKeyFor("promo-burgers-2026", "Mega Burger"), "burger");
  assert.equal(artKeyFor("xyz", "Chopp artesanal"), "beer");
  assert.equal(artKeyFor("novidade", "Batata frita gigante"), "sides");
  assert.equal(artKeyFor("nada", "Brigadeiro especial"), "dessert");
});

test("completely unknown input uses the safe burger default", () => {
  assert.equal(artKeyFor("zzz", "qqq"), "burger");
  assert.equal(artKeyFor(null, null), "burger");
});

test("fallbackArt returns a /generated path for the resolved key", () => {
  assert.equal(fallbackArt("molhos", "Molhos", 0), "/generated/fallback-sauce.png");
  assert.equal(fallbackArt("hamburgueres", "Hambúrgueres", 0), "/generated/fallback-burger.png");
});

test("seed selects a stable variant in {base, -2, -3}", () => {
  // Same key, 3 consecutive seeds → the 3 distinct variants, deterministically.
  assert.equal(fallbackArt("molhos", "Molhos", 0), "/generated/fallback-sauce.png");
  assert.equal(fallbackArt("molhos", "Molhos", 1), "/generated/fallback-sauce-2.png");
  assert.equal(fallbackArt("molhos", "Molhos", 2), "/generated/fallback-sauce-3.png");
  assert.equal(fallbackArt("molhos", "Molhos", 3), "/generated/fallback-sauce.png");
  // Stability: same seed always yields the same path.
  assert.equal(fallbackArt("molhos", "Molhos", 42), fallbackArt("molhos", "Molhos", 42));
});
