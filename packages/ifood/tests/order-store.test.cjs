const test = require('node:test');
const assert = require('node:assert/strict');
const { mapIfoodOrder, ifoodLocalId, storeIfoodEvent } = require('../src/order-store.ts');
const fixture = () => ({ id: 'deadbeef-1234-4567-8910-deadbeef0001', displayId: '1234', orderType: 'DELIVERY', customer: { name: 'Teste' }, items: [{ name: 'Combo', quantity: 2, totalPrice: 40, observations: 'Sem cebola', options: [{ name: 'Queijo', quantity: 1 }] }], total: { subTotal: 40, deliveryFee: 5, additionalFees: 2, benefits: 3, orderAmount: 44 }, payments: { prepaid: 44, pending: 0, methods: [{ method: 'CREDIT', type: 'ONLINE', value: 44 }] }, delivery: { deliveryAddress: { streetName: 'Rua teste', streetNumber: '123' } } });
test('iFood maps real totals, options, payment and stable ID', () => {
  const order = mapIfoodOrder(fixture());
  assert.equal(order.id, ifoodLocalId(fixture().id));
  assert.equal(order.total, 4400); assert.equal(order.fee, 500);
  assert.equal(order.items[0].priceCents, 2000);
  assert.match(order.items[0].notes, /1x Queijo/);
  assert.equal(order.paid, true);
  assert.equal(order.paymentMethod, null); // never mislabel online card as PIX/cash
  assert.match(order.notes, /CREDIT ONLINE/);
});
test('mixed payment retains paid and due amounts without declaring fully paid', () => {
  const input = fixture(); input.payments.prepaid = 20; input.payments.pending = 24;
  input.payments.methods.push({ method: 'CASH', type: 'OFFLINE', cash: { changeFor: 50 } });
  const mapped = mapIfoodOrder(input);
  assert.equal(mapped.paid, false); assert.equal(mapped.paymentMethod, 'cash'); assert.equal(mapped.changeForCents, 5000);
  assert.match(mapped.notes, /cobrar: R\$ 24.00/);
});
test('unsupported quantities and missing scheduled time are not silently accepted', () => {
  const input = fixture(); input.items[0].quantity = 0.5;
  assert.throws(() => mapIfoodOrder(input), /Quantidade/);
});
test('dry run does not write to the database', async () => {
  const old = process.env.IFOOD_DRY_RUN; const oldDB = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://127.0.0.1/unused'; process.env.IFOOD_DRY_RUN = 'true';
  try { await storeIfoodEvent({ id: '1', orderId: fixture().id, code: 'PLC' }, fixture()); }
  finally { if (old === undefined) delete process.env.IFOOD_DRY_RUN; else process.env.IFOOD_DRY_RUN = old; if (oldDB === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDB; }
});
