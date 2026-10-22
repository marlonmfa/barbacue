import { test } from "node:test";
import assert from "node:assert/strict";
import { IFOOD_STORES, allowedIfoodActions, ifoodExternalId, ifoodLocalId, ifoodStoreFromNotes, loadIfoodStores, storeLocalIso } from "../ifood.ts";
import { DEFAULT_MERCHANTS } from "../../../../../packages/ifood/src/merchants.ts";
import { ifoodLocalId as monitorLocalId } from "../../../../../packages/ifood/src/order-store.ts";
import { canAccessPath } from "../permissions.ts";

test("gestor usa as mesmas lojas e a mesma identidade de pedido do monitor", () => {
  assert.deepEqual(IFOOD_STORES, DEFAULT_MERCHANTS);
  assert.equal(ifoodLocalId("abc-123-ext"), monitorLocalId("abc-123-ext"));
});

test("ID externo só é aceito quando corresponde ao pedido local", () => {
  const external = "9f1c2d3e-0000-4a4a-8b8b-123456789abc";
  const notes = `iFood #1234\nPedido externo: ${external}\nLoja iFood: ${IFOOD_STORES[1].id}`;
  assert.equal(ifoodExternalId(ifoodLocalId(external), notes), external);
  assert.equal(ifoodExternalId(ifoodLocalId("outro-pedido-x"), notes), null);
  assert.equal(ifoodExternalId(ifoodLocalId(external), "sem marcação"), null);
  assert.equal(ifoodStoreFromNotes(notes, IFOOD_STORES)?.brand, "barbacue");
});

test("ações seguem a etapa e o tipo do pedido", () => {
  assert.deepEqual(allowedIfoodActions("pending", "delivery"), ["confirm", "cancel"]);
  assert.deepEqual(allowedIfoodActions("confirmed", "delivery"), ["startPreparation", "dispatch", "cancel"]);
  assert.deepEqual(allowedIfoodActions("preparing", "pickup"), ["readyToPickup", "cancel"]);
  for (const status of ["ready", "delivered", "cancelled"]) assert.deepEqual(allowedIfoodActions(status, "delivery"), []);
});

test("mapeamento de lojas rejeita configuração inválida", () => {
  assert.equal(loadIfoodStores({}).length, 3);
  assert.throws(() => loadIfoodStores({ IFOOD_MERCHANTS_JSON: '[{"id":"x","name":"A","brand":"barbacue"}]' }));
  assert.throws(() => loadIfoodStores({ IFOOD_MERCHANTS_JSON: JSON.stringify([IFOOD_STORES[0], IFOOD_STORES[0]]) }));
});

test("interrupção usa horário local da loja sem fuso", () => {
  assert.equal(storeLocalIso(new Date("2026-10-22T15:30:00Z")), "2026-10-22T12:30:00");
});

test("gestor iFood exige a permissão própria", () => {
  assert.equal(canAccessPath({ role: "cashier" }, "/api/admin/ifood/orders/x"), true);
  assert.equal(canAccessPath({ role: "kitchen" }, "/admin/ifood"), false);
  assert.equal(canAccessPath({ role: "cashier", permissions: ["orders"] }, "/admin/ifood"), false);
});
