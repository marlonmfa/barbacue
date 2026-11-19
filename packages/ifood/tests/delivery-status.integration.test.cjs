const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

test('eventos iFood mantêm a saída e conclusão da entrega sem regressão', { skip: !process.env.TEST_IFOOD_DATABASE_URL }, async () => {
  const base = process.env.TEST_IFOOD_DATABASE_URL;
  const schema = `ifood_delivery_test_${process.pid}`;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE TYPE ${schema}.order_status AS ENUM ('pending','confirmed','preparing','ready','delivered','cancelled')`);
    await admin.query(`CREATE TABLE ${schema}.orders (id uuid PRIMARY KEY, brand text, customer_name text, customer_phone text, order_type text, delivery_address text, items jsonb, subtotal_cents integer, discount_cents integer, delivery_fee_cents integer, total_cents integer, channel text, status ${schema}.order_status, payment_method text, payment_status text, change_for_cents integer, notes text, delivery_status text, dispatched_at timestamptz, delivered_at timestamptz)`);
    const url = new URL(base); url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    const { storeIfoodEvent, ifoodLocalId } = require('../src/order-store.ts');
    const input = { id: 'deadbeef-1234-4567-8910-deadbeef0001', orderType: 'DELIVERY', items: [{ name: 'Combo', quantity: 1, unitPrice: 10 }], total: { orderAmount: 10 }, payments: { pending: 10 } };
    const send = (code, order = null) => storeIfoodEvent({ id: code, orderId: input.id, code }, order, 'barbacue', false);
    const row = async () => (await admin.query(`SELECT status, delivery_status, dispatched_at, delivered_at FROM ${schema}.orders WHERE id=$1`, [ifoodLocalId(input.id)])).rows[0];
    await send('DSP', input);
    let state = await row(); assert.equal(state.status, 'ready'); assert.equal(state.delivery_status, 'out_for_delivery'); assert.ok(state.dispatched_at);
    await send('RTP'); state = await row(); assert.equal(state.delivery_status, 'out_for_delivery');
    await send('CON'); state = await row(); assert.equal(state.status, 'delivered'); assert.equal(state.delivery_status, 'delivered'); assert.ok(state.delivered_at);
    await send('DSP'); state = await row(); assert.equal(state.status, 'delivered'); assert.equal(state.delivery_status, 'delivered');
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
