import test from 'node:test';
import assert from 'node:assert/strict';
import { importedOrderId, importBatchSchema } from '../src/lib/imported-orders.ts';
const order = { source: 'Telefone', externalId: 'pedido-1', customerName: 'Cliente', items: [{ name: 'Produto', qty: 2, priceCents: 500 }] };
test('imports normalize source and reject unsafe or inconsistent values', () => {
  assert.equal(importBatchSchema.parse({ orders: [order] }).orders[0].source, 'telefone');
  for (const patch of [{ discountCents: 1001 }, { source: 'kiosk' }, { orderType: 'delivery' }, { items: [] }, { items: [{ name: 'x', qty: 0, priceCents: 5 }] }]) assert.equal(importBatchSchema.safeParse({ orders: [{ ...order, ...patch }] }).success, false);
});
test('import identifiers deduplicate by source + external ID + brand', () => {
  const id = importedOrderId('telefone', 'pedido-1', 'barbacue');
  assert.equal(id, importedOrderId('telefone', 'pedido-1', 'barbacue'));
  assert.notEqual(id, importedOrderId('telefone', 'pedido-1', 'chelas'));
  assert.notEqual(id, importedOrderId('outro', 'pedido-1', 'barbacue'));
  assert.match(id, /^[a-f0-9-]{36}$/);
});
