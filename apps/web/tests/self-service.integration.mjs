// Run only against a disposable local database and local Next server.
// SELF_SERVICE_TEST_URL=http://127.0.0.1:3098 DATABASE_URL=postgresql://.../barbacue_self_service_test_... \
// ADMIN_PASSWORD=... PRINT_AGENT_TOKEN=... node tests/self-service.integration.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const base = process.env.SELF_SERVICE_TEST_URL;
const database = process.env.DATABASE_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local server required');
assert(database && ['localhost', '127.0.0.1'].includes(new URL(database).hostname) && new URL(database).pathname.includes('self_service_test'), 'Disposable self_service_test database required');
const pool = new pg.Pool({ connectionString: database });
const token = process.env.PRINT_AGENT_TOKEN;
assert(token?.length >= 32, 'Test printer token required');
const marker = `self-service-${Date.now()}`;
const requests = [];
let assertions = 0;
let productId, unavailableId, managedId, tableId, staffId;
let settingsBefore;
let existingJobs = [];
async function request(path, { method = 'POST', body, auth, cookie, raw } = {}) {
  const response = await fetch(base + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) });
  return { response, data: await response.json() };
}
function status(result, expected) { assert.equal(result.response.status, expected, JSON.stringify(result.data)); assertions++; return result.data; }
function order(overrides = {}) {
  const body = { requestId: randomUUID(), channel: 'kiosk', customerName: 'Teste de retirada', brand: 'barbacue', paymentMethod: 'cash', items: [{ productId, qty: 2, notes: 'Sem cebola' }], notes: marker, ...overrides };
  requests.push(body.requestId);
  return body;
}
const postOrder = body => request('/api/self-service/orders', { body });
const claim = () => request('/api/print-agent/jobs/claim', { auth: token });
const ack = (job, action, extra = {}) => request(`/api/print-agent/jobs/${job.id}/${action}`, { auth: token, body: { leaseToken: job.leaseToken, ...extra } });

try {
  // Other visual fixtures may share this disposable server. Temporarily hold
  // their queued work so the claim test never acknowledges somebody else's
  // fixture, then restore its original scheduling in finally.
  existingJobs = (await pool.query("SELECT id,next_attempt_at FROM kitchen_print_jobs WHERE status='queued'")).rows;
  if (existingJobs.length) await pool.query("UPDATE kitchen_print_jobs SET next_attempt_at=now()+interval '1 day' WHERE id=ANY($1::uuid[])", [existingJobs.map(job => job.id)]);
  settingsBefore = (await pool.query('SELECT * FROM store_settings WHERE id=1')).rows[0];
  await pool.query("INSERT INTO store_settings(id,store_name,is_open,weekly_hours) VALUES(1,'Teste',true,null) ON CONFLICT(id) DO UPDATE SET is_open=true,weekly_hours=null");
  productId = (await pool.query("INSERT INTO products(name,price_cents,promo_price_cents,available) VALUES($1,3000,2500,true) RETURNING id", [marker])).rows[0].id;
  unavailableId = (await pool.query("INSERT INTO products(name,price_cents,available) VALUES($1,1000,false) RETURNING id", [marker + '-unavailable'])).rows[0].id;
  managedId = (await pool.query("INSERT INTO brand_catalog_products(brand,external_id,name,category,price_cents,available) VALUES('barbadog',$1,$1,'Teste',1700,true) RETURNING id", [marker])).rows[0].id;
  const tableToken = randomUUID();
  tableId = (await pool.query("INSERT INTO restaurant_tables(number,label,token) VALUES(9007,'Mesa teste',$1) RETURNING id", [tableToken])).rows[0].id;

  status(await request('/api/print-agent/jobs/claim'), 401);
  status(await request('/api/print-agent/jobs/claim', { auth: 'wrong-token' }), 401);
  status(await request('/api/admin/kitchen/printing', { method: 'GET' }), 401);
  status(await postOrder(order({ channel: 'table_qr', customerName: undefined })), 422);
  status(await postOrder(order({ customerName: ' ' })), 422);
  status(await postOrder(order({ items: [{ productId: unavailableId, qty: 1 }] })), 422);
  status(await postOrder(order({ items: [{ productId, qty: 21 }] })), 422);
  status(await postOrder(order({ items: [{ productId, qty: 1, priceCents: 1 }] })), 422);
  status(await request('/api/self-service/orders', { raw: JSON.stringify({ notes: 'a'.repeat(21_000) }) }), 413);

  const pickup = order();
  const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => postOrder({ ...pickup, requestId: index % 2 ? pickup.requestId.toUpperCase() : pickup.requestId })));
  assert.equal(concurrent.filter(result => result.response.status === 201).length, 1); assertions++;
  concurrent.forEach(result => assert([200, 201].includes(result.response.status), JSON.stringify(result.data)));
  const pickupReceipt = concurrent[0].data;
  assert(concurrent.every(result => result.data.orderId === pickupReceipt.orderId)); assertions++;
  assert.equal(pickupReceipt.orderType, 'pickup'); assert.equal(pickupReceipt.totalCents, 5000); assertions += 2;
  assert.equal(pickupReceipt.items[0].notes, 'Sem cebola'); assertions++;
  const stored = (await pool.query('SELECT * FROM orders WHERE id=$1', [pickupReceipt.orderId])).rows[0];
  assert.equal(stored.status, 'confirmed'); assert.equal(stored.payment_status, 'pending'); assert.equal(stored.customer_phone, ''); assert.equal(stored.customer_id, null); assertions += 4;
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM kitchen_print_jobs WHERE order_id=$1', [pickupReceipt.orderId])).rows[0].count, 1); assertions++;
  status(await postOrder({ ...pickup, notes: 'outro pedido' }), 409);

  const tableOrder = order({ channel: 'table_qr', customerName: undefined, tableToken, paymentMethod: 'card_on_delivery' });
  const tableReceipt = status(await postOrder(tableOrder), 201);
  assert.equal(tableReceipt.orderType, 'dine_in'); assert.equal(tableReceipt.tableNumber, 9007); assertions += 2;
  const managed = status(await postOrder(order({ brand: 'barbadog', items: [{ productId: managedId, qty: 1 }] })), 201);
  assert.equal(managed.totalCents, 1700); assertions++;
  status(await postOrder(order({ brand: 'chelas', items: [{ productId: managedId, qty: 1 }] })), 422);

  await pool.query('UPDATE store_settings SET is_open=false WHERE id=1');
  assert.deepEqual(status(await postOrder(pickup), 200), pickupReceipt); assertions++;
  status(await postOrder(order()), 422);
  await pool.query('UPDATE store_settings SET is_open=true WHERE id=1');
  await pool.query('UPDATE products SET available=false WHERE id=$1', [productId]);
  status(await postOrder(pickup), 200);
  status(await postOrder(order()), 422);
  await pool.query('UPDATE products SET available=true WHERE id=$1', [productId]);
  await pool.query('UPDATE restaurant_tables SET active=false WHERE id=$1', [tableId]);
  status(await postOrder(order({ channel: 'table_qr', tableToken })), 422);
  status(await postOrder(tableOrder), 200);
  await pool.query('UPDATE restaurant_tables SET active=true,token=$1,number=9008 WHERE id=$2', [randomUUID(), tableId]);
  status(await postOrder(order({ channel: 'table_qr', tableToken })), 422);
  status(await postOrder(tableOrder), 200);

  // A print queue failure must roll back the order, so the same request can be
  // retried after infrastructure recovery without an accepted-but-lost ticket.
  await pool.query(`CREATE OR REPLACE FUNCTION self_service_test_reject_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.ticket->>'notes' = 'self-service-test-force-rollback' THEN RAISE EXCEPTION 'test print queue failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER self_service_test_reject_job BEFORE INSERT ON kitchen_print_jobs FOR EACH ROW EXECUTE FUNCTION self_service_test_reject_job()');
  const rollback = order({ notes: 'self-service-test-force-rollback' });
  status(await postOrder(rollback), 500);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM orders WHERE self_service_request_id=$1', [rollback.requestId])).rows[0].count, 0); assertions++;
  await pool.query('DROP TRIGGER self_service_test_reject_job ON kitchen_print_jobs');
  await pool.query('DROP FUNCTION self_service_test_reject_job()');

  const loginResponse = await request('/api/admin/auth', { body: { password: process.env.ADMIN_PASSWORD } }); status(loginResponse, 200);
  assert(loginResponse.data.ok); assertions++;
  const admin = loginResponse.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const staff = status(await request('/api/admin/staff', { cookie: admin, body: { name: 'Cozinha teste', username: marker, password: 'kitchen-test-password', role: 'kitchen' } }), 201);
  staffId = staff.id;
  const kitchenLogin = await request('/api/admin/auth', { body: { username: marker, password: 'kitchen-test-password' } }); status(kitchenLogin, 200);
  const kitchen = kitchenLogin.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const kitchenQueue = status(await request('/api/admin/kitchen', { method: 'GET', cookie: kitchen }), 200);
  const kitchenTable = kitchenQueue.find(row => row.id === tableReceipt.orderId);
  assert.equal(kitchenTable.tableNumber, 9007); assert.equal(kitchenTable.items[0].notes, 'Sem cebola');
  assert(!('customerPhone' in kitchenTable)); assert(!('priceCents' in kitchenTable.items[0])); assert.equal(kitchenTable.customerName, null); assertions += 5;
  assert.equal(kitchenQueue.find(row => row.id === pickupReceipt.orderId).customerName, 'Teste de retirada'); assertions++;
  const overview = status(await request('/api/admin/kitchen/printing', { method: 'GET', cookie: kitchen }), 200);
  assert(overview.configured); assert.equal(overview.jobs.filter(job => [pickupReceipt.orderId, tableReceipt.orderId, managed.orderId].includes(job.orderId)).length, 3); assertions += 2;

  const claims = await Promise.all(Array.from({ length: 8 }, claim));
  const jobs = claims.map(result => status(result, 200).job).filter(Boolean);
  assert.equal(jobs.length, 3); assert.equal(new Set(jobs.map(job => job.id)).size, 3); assertions += 2;
  jobs.forEach(job => { assert.equal(job.ticket.payment.status, 'pending'); assert(!('totalCents' in job.ticket)); }); assertions += 6;
  const pickupJob = jobs.find(job => job.ticket.orderId === pickupReceipt.orderId);
  const tableJob = jobs.find(job => job.ticket.orderId === tableReceipt.orderId);
  const managedJob = jobs.find(job => job.ticket.orderId === managed.orderId);
  assert.equal(tableJob.ticket.tableNumber, 9007); assertions++;
  status(await ack({ ...pickupJob, leaseToken: randomUUID() }, 'complete'), 409);
  status(await ack(pickupJob, 'complete'), 200);
  status(await ack(pickupJob, 'complete'), 200);
  status(await ack(tableJob, 'fail', { error: 'Não conectou', uncertain: false }), 200);
  status(await ack(tableJob, 'fail', { error: 'Não conectou', uncertain: false }), 200);
  assert.equal(status(await claim(), 200).job, null); assertions++;
  await pool.query("UPDATE kitchen_print_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1", [tableJob.id]);
  const reclaimed = status(await claim(), 200).job;
  assert.equal(reclaimed.id, tableJob.id); assert.notEqual(reclaimed.leaseToken, tableJob.leaseToken); assertions += 2;
  status(await ack(tableJob, 'complete'), 409);
  status(await ack(reclaimed, 'fail', { error: 'Conexão caiu após envio', uncertain: true }), 200);
  status(await ack(reclaimed, 'fail', { error: 'Conexão caiu após envio', uncertain: true }), 200);
  assert.equal(status(await claim(), 200).job, null); assertions++;
  await pool.query("UPDATE kitchen_print_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [managedJob.id]);
  status(await ack(managedJob, 'fail', { error: 'Falha conhecida, recebida após reserva expirar', uncertain: false }), 200);
  assert.equal(status(await claim(), 200).job, null); assertions++;
  assert.equal((await pool.query('SELECT status FROM kitchen_print_jobs WHERE id=$1', [managedJob.id])).rows[0].status, 'uncertain'); assertions++;
  status(await ack(managedJob, 'complete'), 200); // durable local receipt after lease expiry
  status(await request('/api/admin/kitchen/printing', { cookie: kitchen, body: { jobId: reclaimed.id } }), 422);
  status(await request('/api/admin/kitchen/printing', { cookie: kitchen, body: { jobId: reclaimed.id, acknowledgePossibleDuplicate: true } }), 200);
  status(await ack(reclaimed, 'complete'), 409);
  const reprinted = status(await claim(), 200).job;
  assert.equal(reprinted.id, reclaimed.id); assert.equal(reprinted.ticket.reprint, true); assertions += 2;
  status(await ack(reprinted, 'complete'), 200);

  const cancelled = status(await postOrder(order()), 201);
  await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1", [cancelled.orderId]);
  assert.equal(status(await claim(), 200).job, null); assertions++;
  const cancelledJob = (await pool.query('SELECT id,status FROM kitchen_print_jobs WHERE order_id=$1', [cancelled.orderId])).rows[0];
  assert.equal(cancelledJob.status, 'failed'); assertions++;
  status(await request('/api/admin/kitchen/printing', { cookie: kitchen, body: { jobId: cancelledJob.id, acknowledgePossibleDuplicate: true } }), 409);
  const finalOverview = status(await request('/api/admin/kitchen/printing', { method: 'GET', cookie: kitchen }), 200);
  assert(finalOverview.online); assertions++;
  console.log(`Passed ${assertions} self-service/printing integration assertions: canonical pricing, 12 concurrent retries, rollback, QR validity, closed-store recovery, leases, authentication, reprint review and cancellation.`);
} finally {
  await pool.query('DROP TRIGGER IF EXISTS self_service_test_reject_job ON kitchen_print_jobs');
  await pool.query('DROP FUNCTION IF EXISTS self_service_test_reject_job()');
  await pool.query('DELETE FROM kitchen_print_jobs WHERE order_id IN (SELECT id FROM orders WHERE self_service_request_id = ANY($1::uuid[]))', [requests]);
  await pool.query('DELETE FROM orders WHERE self_service_request_id = ANY($1::uuid[])', [requests]);
  if (productId || unavailableId) await pool.query('DELETE FROM products WHERE id = ANY($1::int[])', [[productId, unavailableId].filter(Boolean)]);
  if (managedId) await pool.query('DELETE FROM brand_catalog_products WHERE id=$1', [managedId]);
  if (tableId) await pool.query('DELETE FROM restaurant_tables WHERE id=$1', [tableId]);
  if (staffId) await pool.query('DELETE FROM staff_users WHERE id=$1', [staffId]);
  if (settingsBefore) await pool.query('UPDATE store_settings SET is_open=$1,weekly_hours=$2 WHERE id=1', [settingsBefore.is_open, JSON.stringify(settingsBefore.weekly_hours)]);
  for (const job of existingJobs) await pool.query("UPDATE kitchen_print_jobs SET next_attempt_at=$1 WHERE id=$2 AND status='queued'", [job.next_attempt_at, job.id]);
  await pool.end();
}
