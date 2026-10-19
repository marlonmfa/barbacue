const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_MERCHANTS, loadMerchants, resolveMerchant } = require('../src/merchants.ts');
const { pollCycle, defaultHandler } = require('../src/poller.ts');
const { IfoodClient } = require('../src/client.ts');
const { loadConfig } = require('../src/config.ts');
const config = () => ({ clientId: 'test', clientSecret: 'test', merchantId: DEFAULT_MERCHANTS[1].id, merchants: DEFAULT_MERCHANTS, pollIntervalMs: 30000, dryRun: false, autoConfirm: false });
const event = (i, code = 'PLC') => ({ id: `event-${i}`, orderId: `order-${i}`, merchantId: DEFAULT_MERCHANTS[i].id, code });
const mock = (events) => {
  const calls = { ack: [], fetched: [], confirmed: [] };
  return { calls, config: config(), pollEvents: async () => events,
    getOrder: async id => { calls.fetched.push(id); return { id, merchant: { id: events.find(e => e.orderId === id).merchantId } }; },
    confirm: async id => calls.confirmed.push(id), acknowledgeEvents: async ids => calls.ack.push(...ids) };
};

test('default connections match all three stores, with Hotdog mapped to barbadog', () => {
  const stores = loadMerchants({});
  assert.deepEqual(stores.map(m => [m.id, m.brand]), [
    ['991532f5-0400-4efe-b38a-b2b37f8bd9b0', 'chelas'],
    ['403af0c6-176b-4021-a6cd-3e09dca09cbf', 'barbacue'],
    ['6cb73c63-55cd-459b-a02b-aa936967bf20', 'barbadog'],
  ]);
  assert.equal(loadMerchants({ IFOOD_MERCHANT_ID: stores[0].id, IFOOD_BRAND: 'chelas' }).length, 1);
});
test('unknown, conflicting, missing or duplicate store IDs fail closed', () => {
  assert.throws(() => resolveMerchant(DEFAULT_MERCHANTS), /identificação/);
  assert.throws(() => resolveMerchant(DEFAULT_MERCHANTS, DEFAULT_MERCHANTS[0].id, DEFAULT_MERCHANTS[1].id), /diverge/);
  assert.throws(() => resolveMerchant(DEFAULT_MERCHANTS, 'other'), /identificação/);
  assert.throws(() => loadMerchants({ IFOOD_MERCHANTS_JSON: JSON.stringify([DEFAULT_MERCHANTS[0], DEFAULT_MERCHANTS[0]]) }), /duplicado/);
});
test('three stores are processed independently; failed persistence is never acknowledged', async () => {
  const client = mock([event(0), event(1), event(2)]);
  const brands = [];
  const result = await pollCycle(client, async (e, order) => {
    const m = resolveMerchant(client.config.merchants, e.merchantId, order.merchant.id);
    if (m.brand === 'barbacue') throw new Error('simulated database failure');
    brands.push(m.brand);
  }, async () => false);
  assert.deepEqual(brands, ['chelas', 'barbadog']);
  assert.deepEqual(client.calls.ack, ['event-0', 'event-2']);
  assert.deepEqual(result, { received: 3, processed: 2, failed: 1 });
});
test('wrong store or unavailable details leave events pending', async () => {
  const client = mock([event(0), { ...event(1), merchantId: 'unknown' }]);
  client.getOrder = async () => null;
  const result = await pollCycle(client, async () => assert.fail('must not process'), async () => false);
  assert.equal(result.failed, 2); assert.deepEqual(client.calls.ack, []);
});
test('redelivered status uses stored order without fetching immutable details again', async () => {
  const client = mock([event(0, 'CFM')]);
  let handled = false;
  await pollCycle(client, async (e, order) => { handled = true; assert.equal(order, null); }, async () => true);
  assert.equal(handled, true); assert.deepEqual(client.calls.fetched, []); assert.deepEqual(client.calls.ack, ['event-0']);
});
test('dry run neither acknowledges nor confirms nor touches the database', async () => {
  const client = mock([event(0)]); client.config.dryRun = true;
  await pollCycle(client, defaultHandler, async () => assert.fail('no DB'));
  assert.deepEqual(client.calls.ack, []); assert.deepEqual(client.calls.confirmed, []);
});
test('client filters polling to all configured IDs and dry run cannot acknowledge', async () => {
  const client = new IfoodClient(config()); let request;
  client.http = { request: async (url, options) => { request = { url, options }; return []; } };
  await client.pollEvents();
  assert.equal(request.options.headers['x-polling-merchants'], DEFAULT_MERCHANTS.map(m => m.id).join(','));
  client.config.dryRun = true;
  client.http.request = async () => assert.fail('ACK must not be called');
  await client.acknowledgeEvents(['one']);
});
test('config validates polling cadence and defaults to safe simulation', () => {
  const saved = { ...process.env };
  try {
    process.env.IFOOD_CLIENT_ID = 'test'; process.env.IFOOD_CLIENT_SECRET = 'test';
    delete process.env.IFOOD_DRY_RUN; delete process.env.IFOOD_POLL_INTERVAL_MS;
    assert.equal(loadConfig().dryRun, true); assert.equal(loadConfig().autoConfirm, false);
    for (const interval of ['NaN', '1000', '-1', 'Infinity']) {
      process.env.IFOOD_POLL_INTERVAL_MS = interval;
      assert.throws(() => loadConfig(), /INTERVAL/);
    }
  } finally { process.env = saved; }
});

test('production persists each brand before ACK; confirmation waits for the real CFM event', async () => {
  const { Pool } = require('pg');
  const oldConnect = Pool.prototype.connect;
  const oldDB = process.env.DATABASE_URL;
  const writes = []; const sequence = [];
  Pool.prototype.connect = async () => ({
    query: async (sql, args) => {
      if (sql.startsWith('INSERT INTO orders')) { writes.push(args); sequence.push('persist'); }
      return { rowCount: 1, rows: [{ id: 'stored' }] };
    }, release() {},
  });
  process.env.DATABASE_URL = 'postgresql://unused/test';
  try {
    const client = mock([event(0), event(1), event(2)]);
    client.getOrder = async id => ({ id, displayId: '1234', merchant: { id: client.config.merchants[Number(id.slice(-1))].id }, items: [{ name: 'Combo', quantity: 1, totalPrice: 20 }], total: { orderAmount: 20 } });
    client.acknowledgeEvents = async ids => { sequence.push('ack'); client.calls.ack.push(...ids); };
    await pollCycle(client, defaultHandler, async () => false);
    assert.deepEqual(writes.map(args => args[1]), ['chelas', 'barbacue', 'barbadog']);
    assert.deepEqual(client.calls.confirmed, []);
    assert.deepEqual(sequence, ['persist', 'persist', 'persist', 'ack']);
    assert.ok(writes.every(args => args[11] === 'pending'));
    // Optional commercial confirmation never invents a CFM persistence event.
    writes.length = 0; client.config.autoConfirm = true;
    await pollCycle(client, defaultHandler, async () => false);
    assert.equal(writes.length, 3);
    assert.ok(writes.every(args => args[11] === 'pending'));
    assert.equal(client.calls.confirmed.length, 3);
  } finally {
    Pool.prototype.connect = oldConnect;
    if (oldDB === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDB;
  }
});

test('Food COG token requires ORDER and EVENTS per store without requiring Merchant', () => {
  const { merchantAccessFromToken } = require('../src/auth.ts');
  const token = claims => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  const ids = DEFAULT_MERCHANTS.map(m => m.id);
  const access = merchantAccessFromToken(token({ merchant_scoped: true, scope: ['order', 'events', 'merchant'], merchant_scope: [`${ids[0]}:order`, `${ids[0]}:events`, `${ids[1]}:order`] }), ids);
  assert.deepEqual(access.map(a => a.authorized), [true, false, false]);
  assert.deepEqual(access[0].modules, ['order', 'events']);
  const unrestricted = merchantAccessFromToken(token({ merchant_scoped: false, scope: ['order', 'events'] }), ids);
  assert.ok(unrestricted.every(a => a.authorized));
  assert.throws(() => merchantAccessFromToken('invalid', ids), /permissões/);
  assert.throws(() => merchantAccessFromToken(token({ scope: ['order', 'events'] }), ids), /escopo/);
});

test('live worker waits for grants without consuming events or writing orders', async () => {
  const fs = require('node:fs/promises');
  const watch = require('node:fs').watch;
  const os = require('node:os');
  const path = require('node:path');
  const store = require('../src/order-store.ts');
  const { runPoller } = require('../src/poller.ts');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ifood-pending-test-'));
  const savedEnv = { ...process.env };
  const oldAccess = IfoodClient.prototype.getMerchantAccess;
  const oldPoll = IfoodClient.prototype.pollEvents;
  const oldCheck = store.checkIfoodStore;
  let checks = 0; let polls = 0;
  const completed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { watcher.close(); reject(new Error('worker did not report pending permissions')); }, 3000);
    const watcher = watch(dir, (type, file) => { if (file === 'health.json') { clearTimeout(timer); watcher.close(); resolve(); } });
  });
  process.env.IFOOD_CLIENT_ID = 'test'; process.env.IFOOD_CLIENT_SECRET = 'test';
  process.env.IFOOD_DRY_RUN = 'false'; process.env.DATABASE_URL = 'postgresql://unused/test';
  process.env.IFOOD_HEALTH_FILE = path.join(dir, 'health.json');
  delete process.env.IFOOD_MERCHANT_ID; delete process.env.IFOOD_MERCHANTS_JSON;
  IfoodClient.prototype.getMerchantAccess = async function(refresh) { assert.equal(refresh, true); return this.config.merchants.map(m => ({ id: m.id, modules: [], authorized: false })); };
  IfoodClient.prototype.pollEvents = async () => { polls++; return []; };
  store.checkIfoodStore = async () => { checks++; };
  let running;
  try {
    running = runPoller();
    await completed;
    const health = JSON.parse(await fs.readFile(process.env.IFOOD_HEALTH_FILE, 'utf8'));
    assert.equal(health.state, 'waiting_authorization'); assert.equal(health.pending.length, 3);
    assert.equal(checks, 1); assert.equal(polls, 0);
  } finally {
    process.emit('SIGTERM'); if (running) await running;
    process.env = savedEnv;
    IfoodClient.prototype.getMerchantAccess = oldAccess;
    IfoodClient.prototype.pollEvents = oldPoll;
    store.checkIfoodStore = oldCheck;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
