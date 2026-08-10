// Unit tests for the missing-menu-image classification/query logic.
//
//   ../../node_modules/.bin/tsx --test tests/menu-image-classify.test.ts
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, stockQuery, FLAGSHIP_SLUG } from "../src/lib/menu-image-classify";

test("classify: house-unique categories → ai", () => {
  for (const slug of [
    "combos",
    "combos-individuais",
    "combos-para-compartilhar",
    "hamburgueres",
    "hamburguer-vegetariano",
  ]) {
    assert.equal(classify(slug), "ai", slug);
  }
});

test("classify: real-world categories → web", () => {
  for (const slug of ["adicionais", "molhos", "drinks", "suco-lata", "sobremesas", "vinhos"]) {
    assert.equal(classify(slug), "web", slug);
  }
});

test("classify: FLAGSHIP_SLUG anchors (no partial match)", () => {
  // "combos" must not match a substring category like "supercombos-x".
  assert.equal(FLAGSHIP_SLUG.test("supercombos"), false);
  assert.equal(FLAGSHIP_SLUG.test("hamburgueres-vip"), false);
});

test("stockQuery: accent-insensitive rule matching", () => {
  // "Hambúrguer" (ú) must still hit the /hamburguer/ rule, not the weak fallback.
  assert.equal(stockQuery("Hambúrguer extra"), "hamburger patty");
  assert.equal(stockQuery("Adicional pimenta jalapeño"), "jalapeno peppers");
});

test("stockQuery: specific rules beat generic ones (order matters)", () => {
  assert.equal(stockQuery("Gin Tônica"), "gin tonic cocktail"); // not the generic /gin/
  assert.equal(stockQuery("Molho Barbecue"), "barbecue sauce");
  assert.equal(stockQuery("Batata Waffle"), "waffle fries"); // not plain french fries
  assert.equal(stockQuery("Queijo brie"), "brie cheese"); // not generic melted cheese
});

test("stockQuery: drinks and desserts map to sensible queries", () => {
  assert.equal(stockQuery("Sabor Manga"), "fruit juice can");
  assert.equal(stockQuery("Nutella"), "nutella chocolate spread");
  assert.equal(stockQuery("Prestígio"), "coconut chocolate dessert");
});

test("stockQuery: unknown item never returns empty (safe fallback)", () => {
  const q = stockQuery("Adicional de +6 xpto 350ml");
  assert.match(q, /food$/);
  assert.ok(q.trim().length > "food".length - 1);
});
