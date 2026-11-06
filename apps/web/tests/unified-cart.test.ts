import { canonicalOnlineItems } from "../src/lib/unified-cart";
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

test("/pedir: em pedido misto só itens próprios levam o restaurante no nome", () => {
  const lines = canonicalOnlineItems(
    [{ productId: 7, brand: "chelas", qty: 1 }, { productId: 7, brand: "barbadog", qty: 2 }, { productId: 9, brand: "barbacue", qty: 1 }, { productId: 10, brand: "chelas", qty: 1 }],
    "barbacue",
    [
      { id: 7, brand: "chelas", name: "Burrito", priceCents: 3000, available: true, category: "Burritos" },
      { id: 7, brand: "barbadog", name: "Hot dog", priceCents: 2500, available: true, category: "Hot dogs" },
      { id: 9, brand: "barbacue", name: "Coca-Cola", priceCents: 800, available: true, category: "Bebidas" },
      { id: 10, brand: "chelas", name: "Corona", priceCents: 1400, available: true, category: "Cervejas" },
    ],
  );
  assert.deepEqual(lines.map(line => line.name), ["Chelas · Burrito", "Barbadog · Hot dog", "Coca-Cola", "Corona"]);
  assert.deepEqual(lines.map(line => line.brand), ["chelas", "barbadog", "barbacue", "chelas"]);
});

test("/pedir: pedido de um só restaurante não recebe prefixo", () => {
  const [line] = canonicalOnlineItems([{ productId: 7, qty: 1 }], "chelas",
    [{ id: 7, brand: "chelas", name: "Burrito", priceCents: 3000, available: true, category: "Burritos" }]);
  assert.equal(line.name, "Burrito");
});
