// Carrinho único dos três restaurantes: marca por item, etiqueta e marca principal.
//
//   ../../node_modules/.bin/tsx --test tests/unified-cart.test.ts
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSharedCategory, orderLineLabel } from "../src/lib/brands";
import { canonicalOrderLines, mainBrand, OrderItemError, type CatalogRow } from "../src/lib/order-items";

const row = (id: number, name: string, priceCents: number, category: string): CatalogRow => ({ id, name, priceCents, available: true, category });
const catalog = new Map<string, CatalogRow>([
  ["barbacue:7", row(7, "Smash Duplo", 3900, "Burguers")],
  ["chelas:7", row(7, "Burrito de Carne", 4200, "Burritos")],
  ["barbadog:12", row(12, "Coca-Cola Lata", 700, "Bebidas")],
  ["chelas:30", row(30, "Corona Long Neck", 1200, "Cervejas")],
]);

test("bebidas e cervejas são comuns aos três restaurantes", () => {
  for (const name of ["Bebidas", "Cervejas", "Cerveja Stannis", "Sucos naturais", "ÁGUAS"]) assert.equal(isSharedCategory(name), true, name);
  for (const name of ["Burritos", "Hotdog Tradicional", "Porções", "Sobremesas", null]) assert.equal(isSharedCategory(name), false, String(name));
});

test("mesmo ID em marcas diferentes vira produtos diferentes, com etiqueta do restaurante", () => {
  const lines = canonicalOrderLines([
    { productId: 7, qty: 2 },
    { productId: 7, qty: 1, brand: "chelas", notes: "sem pimenta" },
    { productId: 12, qty: 3, brand: "barbadog" },
  ], "barbacue", catalog);
  assert.deepEqual(lines.map(l => [l.brand, l.name, l.restaurant, l.priceCents, l.qty]), [
    ["barbacue", "Smash Duplo", "Barbacue", 3900, 2],
    ["chelas", "Burrito de Carne", "Chelas", 4200, 1],
    ["barbadog", "Coca-Cola Lata", null, 700, 3],
  ]);
  assert.equal(orderLineLabel(lines[1]), "Chelas · Burrito de Carne");
  assert.equal(orderLineLabel(lines[2]), "Coca-Cola Lata");
});

test("produto inexistente na marca indicada é recusado", () => {
  assert.throws(() => canonicalOrderLines([{ productId: 12, qty: 1, brand: "chelas" }], "barbacue", catalog), OrderItemError);
});

test("marca principal ignora bebidas e usa a origem quando só há itens comuns", () => {
  const lines = canonicalOrderLines([
    { productId: 7, qty: 1 }, { productId: 7, qty: 3, brand: "chelas" }, { productId: 12, qty: 9, brand: "barbadog" },
  ], "barbacue", catalog);
  assert.equal(mainBrand(lines, "barbacue"), "chelas");
  assert.equal(mainBrand(canonicalOrderLines([{ productId: 30, qty: 2, brand: "chelas" }], "barbadog", catalog), "barbadog"), "barbadog");
});
