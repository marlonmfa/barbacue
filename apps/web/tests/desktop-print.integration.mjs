import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { PrintAgent, createApi } from '../../print-agent/src/agent.mjs';
import { Journal } from '../../print-agent/src/journal.mjs';
const base = process.env.DESKTOP_TEST_URL || 'http://127.0.0.1:3099';
const database = process.env.DATABASE_URL || 'postgresql://127.0.0.1/barbacue_desktop_test_20260910';
const token = process.env.PRINT_AGENT_TOKEN || 'desktop-test-print-token-20260910';
for (const url of [new URL(base), new URL(database)]) assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only isolated loopback servers allowed');
assert.match(new URL(database).pathname, /desktop_test/);
const pool = new pg.Pool({ connectionString: database });
const dir = await mkdtemp(join(tmpdir(), 'desktop-integration-'));
const ids = [];
try {
  const readiness = await fetch(`${base}/api/print-agent/status`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(readiness.status, 200);
  assert.equal((await readiness.json()).allChannels, true);
  assert.equal((await fetch(`${base}/api/print-agent/status`, { method: 'POST' })).status, 401);
  const login = await fetch(`${base}/api/admin/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.DESKTOP_TEST_PASSWORD || 'Desktop-test-20260910' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = (path, body, authenticated = true) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/api/admin/orders/import', {}, false)).status, 401);
  const stamp = `${Date.now()}`;
  const sourceList = ['click', 'chat', 'ifood', 'telefone', 'parceiro'];
  const orders = sourceList.map(source => ({ source, externalId: `desktop-test-${stamp}-${source}`, customerName: 'Cliente de teste', orderType: 'delivery', deliveryAddress: 'Rua de teste, 123', items: [{ name: 'Porção teste', qty: 2, priceCents: 1500, notes: 'Sem cebola' }], deliveryFeeCents: 500 }));
  const requests = await Promise.all([post('/api/admin/orders/import', { orders }), post('/api/admin/orders/import', { orders })]);
  const results = await Promise.all(requests.map(async r => { assert.equal(r.status, 200); return r.json(); }));
  assert.equal(results.reduce((sum, r) => sum + r.imported, 0), 5);
  const rows = await pool.query('SELECT id FROM orders WHERE notes LIKE $1', [`%desktop-test-${stamp}-%`]);
  ids.push(...rows.rows.map(row => row.id));
  assert.equal(ids.length, 5);
  const jobs = await pool.query('SELECT * FROM kitchen_print_jobs WHERE order_id=ANY($1::uuid[])', [ids]);
  assert.equal(jobs.rowCount, 5);
  assert.ok(jobs.rows.every(j => j.ticket.version === 2 && j.ticket.totalCents === 3500));
  await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1", [ids[0]]);
  const journal = new Journal(dir); await journal.init();
  const printed = [];
  const agent = new PrintAgent({ journal, api: createApi({ apiUrl: base, token }), print: async text => { printed.push(text); return { transport: 'test-only' }; }, log: () => {} });
  for (let n = 0; n < 6; n++) await agent.runOnce();
  assert.equal(printed.length, 4);
  assert.ok(printed.every(t => t.includes('Rua de teste, 123') && t.includes('35,00') && t.includes('Sem cebola')));
  const counts = await pool.query('SELECT status,count(*)::int AS n FROM kitchen_print_jobs WHERE order_id=ANY($1::uuid[]) GROUP BY status', [ids]);
  assert.equal(counts.rows.find(r => r.status === 'printed').n, 4);
  assert.equal(counts.rows.find(r => r.status === 'failed').n, 1);
  // A business update must not enqueue a second copy.
  await pool.query("UPDATE orders SET status='preparing' WHERE id=ANY($1::uuid[]) AND status <> 'cancelled'", [ids]);
  assert.equal(await agent.runOnce(), false);
  assert.equal(printed.length, 4);
  console.log('PASS: authenticated import, five sources, concurrent deduplication, atomic tickets, cancellation, agent delivery, no duplicate after status change.');
} finally {
  if (ids.length) { await pool.query('DELETE FROM kitchen_print_jobs WHERE order_id=ANY($1::uuid[])', [ids]); await pool.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [ids]); }
  await pool.end(); await rm(dir, { recursive: true, force: true });
}
