// Unit tests for the order card title and fixed tag colors.
//
//   ../../node_modules/.bin/tsx --test tests/order-owner.test.ts
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { orderOwner, originTag, BRAND_TAG } from "../src/lib/order-owner";

const base = { customerName: "Cliente Anota AI", tableNumber: null, orderType: "dine_in" as const, id: "6af27348-0000", notes: "" };

test("named customer is the title", () => {
  assert.deepEqual(orderOwner({ ...base, customerName: "Guilherme Fragoso" }), { title: "Guilherme Fragoso", detail: null });
});

test("salão orders without a customer show the table and waiter", () => {
  const notes = "Anota AI #12829\nPedido externo: x\nLoja Anota AI: Barbacue\nMesa: Mesa 16\nPagamento: A definir R$ 62,00 — cobrar na entrega · Garçom: Caroline Kusz";
  assert.deepEqual(orderOwner({ ...base, notes }), { title: "Mesa 16", detail: "Garçom: Caroline Kusz" });
  assert.equal(orderOwner({ ...base, tableNumber: 7 }).title, "Mesa 7");
});

test("pickup without a customer shows the external order number", () => {
  assert.equal(orderOwner({ ...base, orderType: "pickup", notes: "Anota AI #12832\nLoja Anota AI: Barbacue" }).title, "Retirada no balcão #12832");
});

test("tag colors are fixed per origin and per restaurant", () => {
  assert.equal(originTag("anotaai").bg, originTag("anotaai").bg);
  assert.equal(originTag("anotaai").label, "Anota AI");
  assert.notEqual(originTag("anotaai").bg, originTag("ifood").bg);
  assert.equal(new Set(Object.values(BRAND_TAG).map((t) => t.bg)).size, 3);
  assert.equal(originTag("novo_canal").label, "novo_canal");
});
