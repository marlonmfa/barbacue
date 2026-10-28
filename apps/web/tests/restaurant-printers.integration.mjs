import assert from 'node:assert/strict';
import { randomUUID, scryptSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createApi, PrintAgent } from '../../print-agent/src/agent.mjs';
import { Journal } from '../../print-agent/src/journal.mjs';

const base = process.env.PRINTER_TEST_URL ?? 'http://127.0.0.1:43217';
const database = process.env.DATABASE_URL ?? 'postgresql://127.0.0.1/barbacue_printer_test_20261023';
for (const url of [new URL(base), new URL(database)]) assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.match(new URL(database).pathname, /^\/barbacue_printer_test[_\w]*$/);
const pool = new pg.Pool({ connectionString: database });
const token = process.env.PRINT_AGENT_TOKEN ?? 'printer-test-token-isolated-20261023';
const password = process.env.PRINTER_TEST_PASSWORD ?? 'Printer-test-2026';
const deviceA = { id: randomUUID(), name: 'Computador A', printers: [{ name: 'Cozinha USB', displayName: 'Cozinha USB' }] };
const deviceB = { id: randomUUID(), name: 'Computador B', printers: [{ name: 'Cozinha USB', displayName: 'Cozinha USB' }] };
const apiA = createApi({ apiUrl: base, token, deviceId: deviceA.id, acceptDefault: false });
const apiB = createApi({ apiUrl: base, token, deviceId: deviceB.id, acceptDefault: false });
const legacy = createApi({ apiUrl: base, token });
const dir = await mkdtemp(join(tmpdir(), 'restaurant-printers-'));
const ids = [], staffIds = [];
let cookie;
let ownsRoutes = false;

async function request(path, body, method = 'POST', headers = {}, status = 200) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  assert.equal(res.status, status, `${path}: ${text.slice(0, 300)}`);
  return { res, data: JSON.parse(text) };
}
const save = (brand, mode, device, paper = 80, status = 200) => request('/api/admin/kitchen/printers', { brand, mode, deviceId: device?.id, printerName: device?.printers[0]?.name, paper }, 'PUT', { cookie }, status);
async function order(brand, channel = 'click') {
  const { rows } = await pool.query(`INSERT INTO orders(brand,customer_name,customer_phone,order_type,items,subtotal_cents,total_cents,status,channel)
    VALUES ($1,'Cliente teste','11900000000','pickup',$2,1500,1500,'confirmed',$3) RETURNING id`, [brand, JSON.stringify([{ name: 'Pedido de teste para validar destino e papel', qty: 1, price_cents: 1500 }]), channel]);
  ids.push(rows[0].id);
  return rows[0].id;
}
async function queued(id) {
  const { rows } = await pool.query('SELECT status,attempts,destination FROM kitchen_print_jobs WHERE order_id=$1', [id]);
  assert.equal(rows[0].status, 'queued'); assert.equal(rows[0].attempts, 0);
}

try {
  // This test must own the empty database; never change another test's routes.
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM kitchen_printer_routes')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM kitchen_print_jobs')).rows[0].n, 0);
  ownsRoutes = true;
  await request('/api/print-agent/status', { device: deviceA }, 'POST', {}, 401);
  await request('/api/admin/kitchen/printers', undefined, 'GET', {}, 401);
  await request('/api/admin/kitchen/printers', { brand: 'barbacue', mode: 'paused' }, 'PUT', {}, 401);
  const login = await request('/api/admin/auth', { password });
  cookie = login.res.headers.get('set-cookie').split(';')[0];
  for (const role of ['kitchen', 'waiter']) {
    const username = `printer-${role}-${randomUUID()}`;
    const salt = randomUUID().replaceAll('-', '');
    const hash = `${salt}:${scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex')}`;
    const staff = await pool.query('INSERT INTO staff_users(name,username,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id', [role, username, hash, role]);
    staffIds.push(staff.rows[0].id);
    const loggedIn = await request('/api/admin/auth', { username, password });
    await request('/api/admin/kitchen/printers', undefined, 'GET', { cookie: loggedIn.res.headers.get('set-cookie').split(';')[0] }, role === 'kitchen' ? 200 : 403);
  }
  assert.equal((await apiA.status(deviceA)).printerRouting, true);
  await apiB.status(deviceB);
  await request('/api/print-agent/status', { device: { ...deviceA, printers: [{ name: '\u001b', displayName: 'bad' }] } }, 'POST', { authorization: `Bearer ${token}` }, 422);
  await save('barbacue', 'printer', deviceA);
  await save('chelas', 'printer', deviceB, 58);
  await save('barbadog', 'paused');
  await save('unknown', 'paused', undefined, 80, 422);
  await save('chelas', 'printer', { ...deviceB, printers: [{ name: 'missing' }] }, 80, 409);
  const a = await order('barbacue', 'ifood');
  const b = await order('chelas', 'table_qr');
  // QR orders are normally enqueued by the application transaction.
  await pool.query(`INSERT INTO kitchen_print_jobs(order_id,ticket) SELECT id,jsonb_build_object(
    'version',2,'orderId',id,'orderNumber',upper(left(id::text,8)),'brand',brand,'channel',channel,'orderType','pickup',
    'tableNumber',null,'tableLabel',null,'customerName',customer_name,'items',items,'notes',null,'createdAt',created_at,
    'payment',jsonb_build_object('status','pending','method','cash'),'reprint',false) FROM orders WHERE id=$1`, [b]);
  const held = await order('barbadog', 'chat');
  assert.equal((await legacy.claim()).job, null, 'legacy agent must not steal mapped or paused orders');
  const claims = await Promise.all([apiA.claim(), apiA.claim()]);
  assert.equal(claims.filter(result => result.job).length, 1, 'concurrent claims print only one copy');
  const first = claims.find(result => result.job).job;
  assert.equal(first.ticket.orderId, a);
  assert.deepEqual(first.destination, { deviceId: deviceA.id, printerName: 'Cozinha USB', paper: 80 });
  await apiA.complete(first); await apiA.complete(first);
  const journal = new Journal(dir); await journal.init();
  const sent = [];
  const agentB = new PrintAgent({ journal, api: apiB, print: async (text, ticket, destination) => {
    sent.push({ ticket, destination });
    assert.ok(text.split('\n').every(line => line.length <= (destination.paper === 58 ? 32 : 48)));
    return { transport: 'test-only' };
  }, log: () => {} });
  assert.equal(await agentB.runOnce(), true);
  assert.equal(sent[0].ticket.orderId, b); assert.equal(sent[0].destination.paper, 58);
  assert.equal(await agentB.runOnce(), false);
  await queued(held);

  const missing = await order('barbacue', 'telefone');
  await apiA.status({ ...deviceA, printers: [] });
  assert.equal((await apiA.claim()).job, null);
  assert.equal((await legacy.claim()).job, null);
  await queued(missing);
  await apiA.status(deviceA);
  await pool.query("UPDATE kitchen_print_devices SET last_seen_at=now()-interval '2 minutes' WHERE id=$1", [deviceA.id]);
  assert.equal((await apiA.claim()).job, null);
  await queued(missing);
  await apiA.status(deviceA);
  const recovered = (await apiA.claim()).job;
  assert.equal(recovered.ticket.orderId, missing);
  await apiA.complete(recovered);

  // Remapping sends a still-queued order to the new destination, never to A.
  await save('barbadog', 'printer', deviceB, 210);
  assert.equal((await apiA.claim()).job, null);
  assert.equal(await agentB.runOnce(), true);
  assert.equal(sent[1].ticket.orderId, held); assert.equal(sent[1].destination.paper, 210);
  // Default mode deliberately preserves existing agent installations.
  await save('barbacue', 'default');
  const fallback = await order('barbacue');
  assert.equal((await apiA.claim()).job, null, 'mapped-only desktop skips default jobs');
  const defaultJob = (await legacy.claim()).job;
  assert.equal(defaultJob.ticket.orderId, fallback); assert.equal(defaultJob.destination, null);
  await legacy.complete(defaultJob);
  const overview = await request('/api/admin/kitchen/printers', undefined, 'GET', { cookie });
  assert.equal(overview.data.devices.find(device => device.id === deviceA.id).online, true);
  assert.equal(overview.data.routes.length, 2);
  const audit = (await pool.query('SELECT destination FROM kitchen_print_jobs WHERE order_id=$1', [b])).rows[0];
  assert.equal(audit.destination.deviceId, deviceB.id);
  console.log('PASS: authenticated pairing inventory; kitchen permissions; same-name printers on two computers; concurrent claims; restaurant isolation; 58/80/A4 paper; paused, missing and offline queues; remapping; legacy compatibility; destination audit; no duplicate printing.');
} finally {
  if (ids.length) {
    await pool.query('DELETE FROM kitchen_print_jobs WHERE order_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [ids]);
  }
  if (ownsRoutes) await pool.query('DELETE FROM kitchen_printer_routes WHERE device_id=ANY($1::uuid[]) OR (brand=$2 AND device_id IS NULL)', [[deviceA.id, deviceB.id], 'barbadog']);
  await pool.query('DELETE FROM kitchen_print_devices WHERE id=ANY($1::uuid[])', [[deviceA.id, deviceB.id]]);
  if (staffIds.length) await pool.query('DELETE FROM staff_users WHERE id=ANY($1::int[])', [staffIds]);
  await pool.end(); await rm(dir, { recursive: true, force: true });
}
