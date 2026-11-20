// Execute on otherpages. Read-only verification in production; fixture writes
// are confined to the named restored database and the preview port.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { createHash, randomBytes, scryptSync } = require('node:crypto');
const { Pool } = require('/root/barbacue/node_modules/pg');
const previous = require('/root/deploy-backups/barbacue-finance-production-20261118-r2/verify.cjs');

const web = '/root/barbacue/apps/web';
const backup = '/root/deploy-backups/barbacue-routing-20261120';
const dist = process.env.ROUTING_RELEASE_DIST || '.next-routing-prod-20261120';
const livePort = 3007;
const previewPort = 43192;
const previewDatabase = 'barbacue_routing_preview_20261120_v2';
const maps = {
  DELIVERY_OSRM_URL: 'http://127.0.0.1:18965',
  DELIVERY_NOMINATIM_URL: 'http://127.0.0.1:18966',
  DELIVERY_NOMINATIM_MIN_INTERVAL_MS: '50',
  DELIVERY_OSM_USER_AGENT: 'BarbacueDelivery/1.0',
  DELIVERY_CNEFE_INDEX_PATH: '/root/barbacue-routing-staging/cnefe/address-index.json',
};
const sha = data => createHash('sha256').update(data).digest('hex');
const save = (name, data) => fs.writeFileSync(path.join(backup, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });

function request(port, pathname, { cookie, method = 'GET', body, expected = 200 } = {}) {
  return new Promise((resolve, reject) => {
    const raw = body === undefined ? null : JSON.stringify(body);
    const headers = { Host: 'barbacue.cog.ia.br', ...(cookie ? { Cookie: cookie } : {}),
      ...(raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {}) };
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, res => {
      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        try {
          assert.equal(res.statusCode, expected, method + ' ' + pathname.replace(/[0-9a-f-]{36}/ig, '[id]'));
          resolve({ headers: res.headers, buffer: Buffer.concat(data) });
        } catch (error) { reject(error); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('HTTP timeout')));
    req.end(raw);
  });
}

async function json(port, pathname, options) {
  return JSON.parse((await request(port, pathname, options)).buffer.toString());
}

async function waitReady(port) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await request(port, '/api/store-status'); return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw Error('Build indisponível na porta ' + port);
}

async function regressions(port, db, cookie) {
  for (const pathname of ['/', '/barbadog', '/chelas', '/admin/dispatch', '/admin/orders/feed', '/admin/financeiro', '/admin/cobertura-documental',
    '/admin/ifood', '/admin/ifood/cardapio', '/admin/ifood/entregas', '/admin/ifood/financeiro']) await request(port, pathname, { cookie });
  const feed = await request(port, '/admin/orders/feed?origem=ifood', { cookie });
  assert.match(feed.buffer.toString(), /Feed de pedidos/);
  assert.match(feed.buffer.toString(), /data-testid="feed-order"/);
  assert.match(feed.buffer.toString(), /data-testid="feed-pdf"/);
  const found = /href="(\/api\/admin\/orders\/[0-9a-f-]{36}\/comanda\?parte=1)"/i.exec(feed.buffer.toString());
  assert(found, 'Feed sem link de PDF');
  await request(port, found[1], { expected: 401 });
  const pdf = await request(port, found[1], { cookie });
  assert.match(pdf.headers['content-type'], /^application\/pdf/);
  assert.match(pdf.buffer.subarray(0, 8).toString(), /^%PDF-/);
  const doors = await json(port, '/api/admin/dispatch', { cookie });
  assert.equal(doors.mapsReady, true);
  assert.equal(doors.config.automatic, false);
  await request(port, '/api/admin/dispatch', { expected: 401 });
  const origin = await json(port, '/api/admin/delivery-settings', { cookie });
  assert.equal(origin.providers.osm.configured, true);
  assert.equal(origin.settings.originLatitude, -26.4915129);
  assert.equal(origin.settings.originLongitude, -49.0747559);
  assert.equal(origin.settings.enabled, false);
  const coverage = await json(port, '/api/admin/document-coverage', { cookie });
  const finance = await json(port, '/api/admin/financeiro', { cookie });
  assert(Array.isArray(finance.sales) && finance.sales.length);
  const ifood = await json(port, '/api/admin/ifood?view=stores', { cookie });
  assert(Array.isArray(ifood.stores) && ifood.stores.length === 3);
  await request(port, '/api/admin/downloads/windows/manifest', { cookie });
  const state = (await db.query("select count(*)::int as orders, (select count(*)::int from kitchen_print_jobs) as print_jobs from orders")).rows[0];
  return { state, pdfBytes: pdf.buffer.length, coverageHash: sha(JSON.stringify(coverage)), salesRows: finance.sales.length, ifoodStores: ifood.stores.length };
}

async function login(port, db, role) {
  const username = 'routing-release-' + role + '-' + randomBytes(5).toString('hex');
  const password = randomBytes(24).toString('hex');
  const salt = randomBytes(16);
  const hash = salt.toString('hex') + ':' + scryptSync(password, salt, 64).toString('hex');
  const { rows: [user] } = await db.query("insert into staff_users(name,username,password_hash,role) values ($1,$2,$3,$4) returning id",
    [role === 'driver' ? 'Entregador de homologação' : 'Operador de homologação', username, hash, role]);
  const response = await request(port, '/api/admin/auth', { method: 'POST', body: { username, password } });
  const cookie = response.headers['set-cookie'].find(value => value.startsWith('barbacue_admin=')).split(';')[0];
  return { cookie, id: user.id };
}

async function fixture(db, admin, driver) {
  const port = previewPort;
  await request(port, '/api/admin/dispatch', { cookie: driver.cookie, expected: 403 });
  await request(port, '/api/admin/delivery/presence', { cookie: driver.cookie, method: 'PATCH', body: { available: true } });
  await db.query("update delivery_settings set enabled=true, base_fee_cents=300, fee_per_km_cents=125, min_fee_cents=400, max_distance_meters=20000 where id=1");
  await db.query("insert into store_settings(id,store_name,is_open,weekly_hours) values(1,'Homologação',true,null) on conflict(id) do update set is_open=true,weekly_hours=null");
  const { rows: [product] } = await db.query("insert into products(name,price_cents,available) values('Produto de homologação',1500,true) returning id");
  const destinations = ['Prefeitura de Jaraguá do Sul', 'Museu Histórico Emílio da Silva, Jaraguá do Sul'];
  const ids = [];
  for (const address of destinations) {
    const quote = await json(port, '/api/delivery/quote', { method: 'POST', expected: 201, body: { address, brand: 'barbacue' } });
    assert(quote.distanceMeters > 0 && quote.durationSeconds > 0 && quote.feeCents >= 400);
    const result = await json(port, '/api/orders', { method: 'POST', expected: 201, body: {
      brand: 'barbacue', customerName: 'Pedido de homologação', customerPhone: '47999999999', deliveryAddress: address,
      deliveryQuoteId: quote.quoteId, paymentMethod: 'cash', items: [{ productId: product.id, qty: 1 }],
    } });
    assert.equal(result.deliveryFeeCents, quote.feeCents);
    const { rows: [order] } = await db.query("update orders set status='ready' where id=$1 and delivery_quote_id=$2 returning id,delivery_access_token", [result.orderId, quote.quoteId]);
    ids.push(order);
  }
  await db.query("update delivery_settings set enabled=false,base_fee_cents=0,fee_per_km_cents=0,min_fee_cents=0,max_distance_meters=10000 where id=1");
  const generated = await json(port, '/api/admin/dispatch', { cookie: admin.cookie, method: 'POST' });
  assert(generated.created >= 1);
  const overview = await json(port, '/api/admin/dispatch', { cookie: admin.cookie });
  const route = overview.routes.find(item => ids.every(order => item.stops.some(stop => stop.id === order.id)));
  assert(route && route.distanceMeters > 0 && route.durationSeconds > 0);
  await request(port, '/api/admin/dispatch', { method: 'PATCH', cookie: admin.cookie, body: { id: route.id, driverId: driver.id } });
  const assigned = await json(port, '/api/admin/delivery', { cookie: driver.cookie });
  const planned = assigned.filter(order => order.dispatchRouteId === route.id);
  assert.deepEqual(planned.map(order => order.dispatchPosition), planned.map((_, index) => index + 1));
  for (const order of ids) {
    const item = planned.find(result => result.id === order.id);
    assert(item && item.deliveryStatus === 'out_for_delivery');
    const visit = new URL(item.navigationLinks.google);
    assert.equal(visit.searchParams.get('dir_action'), 'navigate');
    assert.equal(visit.searchParams.has('key'), false);
    const link = await json(port, '/api/entregas/' + order.delivery_access_token);
    assert.equal(new URL(link.navigation.google).searchParams.get('destination'), visit.searchParams.get('destination'));
    await request(port, '/api/admin/delivery', { cookie: driver.cookie, method: 'PATCH', body: { id: order.id, deliveryStatus: 'delivered' } });
  }
  const complete = await json(port, '/api/admin/delivery', { cookie: driver.cookie });
  assert(ids.every(order => complete.some(item => item.id === order.id && item.deliveryStatus === 'delivered')));
  return { syntheticOrders: ids.length, routeStops: route.stops.length, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, automatic: overview.config.automatic };
}

async function main() {
  assert.equal(execFileSync('hostname', { encoding: 'utf8' }).trim(), 'otherpages');
  const mode = process.argv[2];
  assert(['preview', 'production'].includes(mode));
  const processEnv = previous.scope().pm2_env;
  const env = Object.fromEntries(Object.entries(processEnv).filter(([, value]) => typeof value === 'string'));
  const liveDb = new Pool({ connectionString: env.DATABASE_URL, options: '-c default_transaction_read_only=on' });
  const dbUrl = new URL(env.DATABASE_URL);
  dbUrl.pathname = '/' + previewDatabase;
  const clone = mode === 'preview' ? new Pool({ connectionString: dbUrl.href }) : null;
  let processStarted;
  try {
    if (mode === 'production') {
      const cookie = await previous.verify(livePort, 'browser-token');
      const result = await regressions(livePort, liveDb, cookie);
      const checks = JSON.parse(fs.readFileSync(path.join(backup, 'preview-result.json'), 'utf8'));
      assert.equal(result.coverageHash, checks.regression.coverageHash);
      assert(result.state.orders >= checks.regression.state.orders);
      assert(result.state.print_jobs >= checks.regression.state.print_jobs);
      save('production-result.json', { ...result, automatic: false, build: fs.readFileSync(path.join(web, dist, 'BUILD_ID'), 'utf8').trim() });
      console.log(JSON.stringify({ production: true, ...result, automatic: false }));
      return;
    }

    const expected = (await clone.query('select current_database() as name')).rows[0];
    assert.equal(expected.name, previewDatabase);
    assert.equal((await clone.query("select config->>'automatic' as automatic from dispatch_settings where id=1")).rows[0].automatic, 'false');
    const liveCookie = await previous.verify(livePort, 'browser-token');
    const baselineCoverage = await json(livePort, '/api/admin/document-coverage', { cookie: liveCookie });
    const existingPdf = await request(livePort, '/admin/orders/feed?origem=ifood', { cookie: liveCookie });
    const found = /href="(\/api\/admin\/orders\/[0-9a-f-]{36}\/comanda\?parte=1)"/i.exec(existingPdf.buffer.toString());
    assert(found, 'Feed ativo sem link de PDF');
    const originalPdf = await request(livePort, found[1], { cookie: liveCookie });

    const log = fs.openSync(path.join(backup, 'preview.log'), 'w', 0o600);
    processStarted = spawn(process.execPath, [path.join(backup, 'launch-preview.cjs')], { cwd: web,
      env: { ...env, ...maps, HOST: '', HOSTNAME: '127.0.0.1', PORT: String(previewPort),
        DATABASE_URL: dbUrl.href, ADMIN_COOKIE_SECRET: randomBytes(40).toString('hex'),
        BOT_API_TOKEN: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', IFOOD_DRY_RUN: 'true' },
      stdio: ['ignore', log, log] });
    await waitReady(previewPort);
    const [admin, driver] = await Promise.all([login(previewPort, clone, 'admin'), login(previewPort, clone, 'driver')]);
    const regression = await regressions(previewPort, clone, admin.cookie);
    assert.equal(regression.coverageHash, sha(JSON.stringify(baselineCoverage)));
    const previewPdf = await request(previewPort, found[1], { cookie: admin.cookie });
    assert.equal(sha(previewPdf.buffer), sha(originalPdf.buffer), 'PDF histórico divergiu');
    const e2e = await fixture(clone, admin, driver);
    save('preview-result.json', { regression, e2e, historicalPdfUnchanged: true });
    console.log(JSON.stringify({ regression, e2e, historicalPdfUnchanged: true }));
  } finally {
    processStarted?.kill('SIGTERM');
    await clone?.end();
    await liveDb.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
