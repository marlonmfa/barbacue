// Executar por stdin na imagem candidata, com o mesmo ambiente de conexão.
// A tabela temporária oculta a fila real apenas nesta sessão e é descartada ao sair.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { enqueueEvents, recordProcessedEvent } = require('./packages/ifood/dist/webhook');
const { webhookAudit } = require('./packages/ifood/dist/webhook-audit');
const db = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await db.connect();
  await db.query('CREATE TEMP TABLE ifood_webhook_inbox (LIKE public.ifood_webhook_inbox INCLUDING ALL)');
  const sample = (await db.query("SELECT id,brand,notes,status FROM public.orders WHERE channel='ifood' ORDER BY created_at DESC LIMIT 1")).rows[0];
  assert.ok(sample, 'É necessário um pedido existente para testar o vínculo somente de leitura');
  const orderId = /Pedido externo: ([^\n]+)/.exec(sample.notes)[1];
  const merchantId = /Loja iFood: ([^\n]+)/.exec(sample.notes)[1];
  const adapter = { query: (...args) => db.query(...args), connect: async () => ({ query: (...args) => db.query(...args), release() {} }) };
  const event = { id: 'audit-isolated-test', merchantId, orderId, code: 'COG_WEBHOOK_TEST', fullCode: 'COG_WEBHOOK_TEST', createdAt: '2026-10-23T22:30:00-03:00' };
  await enqueueEvents(adapter, [event]);
  const received = (await db.query('SELECT received_at FROM ifood_webhook_inbox')).rows[0].received_at;
  await recordProcessedEvent(adapter, event, sample.brand);
  const processed = (await db.query('SELECT processed_at FROM ifood_webhook_inbox')).rows[0].processed_at;
  await enqueueEvents(adapter, [event]);
  const row = (await webhookAudit(adapter, 10))[0];
  assert.equal(row.order_id, orderId);
  assert.equal(row.event_code, event.code);
  assert.equal(row.event_full_code, event.fullCode);
  assert.equal(row.event_created_at.toISOString(), '2026-10-24T01:30:00.000Z');
  assert.equal(row.received_at.toISOString(), received.toISOString());
  assert.equal(row.processed_at.toISOString(), processed.toISOString());
  assert.equal(row.panel_present, true);
  assert.equal(row.local_order_id, sample.id);
  assert.equal(row.local_status_at_processing, sample.status);
  assert.equal(row.attempts, 1);
  const totals = (await db.query('SELECT count(*)::int AS total,count(payload)::int AS payloads FROM ifood_webhook_inbox')).rows[0];
  assert.deepEqual(totals, { total: 1, payloads: 0 });
  console.log('PASS: metadata survives processing and redelivery; panel link matches; production queue/orders untouched');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
