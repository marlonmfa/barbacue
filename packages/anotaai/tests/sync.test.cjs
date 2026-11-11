const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { AnotaClient } = require('../src/client.ts');
const { parsePages, loadConfig } = require('../src/config.ts');
const { anotaLocalId, toBarbacueOrder, localOfCheck } = require('../src/order-store.ts');
const { syncPage, CANCEL_REQUESTED, actionFailedNote } = require('../src/sync.ts');

const PAGE = { pageId: '65d4a42543b0de0019666db0', brand: 'barbadog', name: 'Barbadog' };
const NEW = '66b6258e890ffb00126c4233', OLD = '66b6258e890ffb00126c4299', LOCAL = '66b6258e890ffb00126c4300', REMOTE = '66b6258e890ffb00126c4301', ASK = '66b6258e890ffb00126c4302', REJECT = '66b6258e890ffb00126c4303';
const remote = {};
const hidden = new Set(); // pedidos de dias anteriores: fora da listagem do dia
const calls = [];
let tokens = 0;
const detail = id => ({ _id: id, check: remote[id], shortReference: 77, type: 'DELIVERY', customer: { name: 'Ana', phone: '47999990000' }, deliveryAddress: { formattedAddress: 'Rua A, 1', neighborhood: 'Centro' }, items: [{ name: '.Hot dog', quantity: 2, total: 30, observation: 'sem cebola', subItems: [{ name: 'Bacon', quantity: 1 }] }], payments: [{ code: 'money', value: '35', changeFor: 50, prepaid: false }], deliveryFee: 5, total: 35 });
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', c => (body += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    calls.push({ m: req.method, p: u.pathname, q: u.search, len: req.headers['content-length'], ua: req.headers['user-agent'], page: req.headers['x-page-id'], body });
    const json = j => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (u.pathname.endsWith('/oauth-client/token')) { tokens++; return json({ accessToken: 'tok', expiresIn: 3600 }); }
    if (req.headers['x-page-id'] !== PAGE.pageId) return json({ success: false, message: 'x-page-id inválido' });
    const p = '/api-old/partnerauth/v2';
    if (u.pathname === `${p}/ping/list`) return json({ success: true, info: { docs: Object.entries(remote).filter(([_id]) => !hidden.has(_id)).map(([_id, check]) => ({ _id, check })), limit: 100 } });
    const g = u.pathname.match(/\/ping\/get\/(\w+)$/); if (g) return json({ success: true, info: detail(g[1]) });
    const m = u.pathname.match(/\/order\/(accept|ready|finalize|cancel)\/(\w+)$/);
    if (m && m[2] === REJECT) return json({ success: false, message: 'Pedido já foi negado' });
    if (m) { remote[m[2]] = { accept: 1, ready: 2, finalize: 3, cancel: 4 }[m[1]]; return json({ success: true, info: { check: remote[m[2]] } }); }
    json({ success: false, message: 'rota' });
  });
});
function memStore() {
  const rows = new Map();
  return { rows,
    async statuses(ids) { return new Map(ids.filter(i => rows.has(i)).map(i => [i, rows.get(i).status])); },
    async insert(o, status) { if (rows.has(o.id)) return false; rows.set(o.id, { ...o, status }); return true; },
    async advance(id, status) { const r = rows.get(id); if (!r || ['cancelled', 'delivered'].includes(r.status)) return false; r.status = status; return true; },
    async appendNote(id, note) { const r = rows.get(id); if (r && !r.notes.includes(note)) r.notes += '\n' + note; },
    async openOutside(brand, exclude, since, limit) {
      return [...rows.values()].filter(r => r.brand === brand && !exclude.includes(r.id) && ['pending', 'confirmed', 'preparing', 'ready'].includes(r.status))
        .map(r => (r.notes.match(/Pedido externo: ([0-9a-f]{24})/) || [])[1]).filter(Boolean).slice(0, limit);
    },
    async check() {} };
}

test.before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { process.env.ANOTAAI_API_BASE = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => server.close());

test('config: páginas, marca, intervalo padrão de 60 s e ações ligadas por padrão', () => {
  const env = { ANOTAAI_CLIENT_ID: 'c', ANOTAAI_CLIENT_SECRET: 's', ANOTAAI_PAGES_JSON: JSON.stringify([PAGE]) };
  const cfg = loadConfig(env);
  assert.equal(cfg.pollIntervalMs, 60000); assert.equal(cfg.actions, true); assert.equal(cfg.dryRun, true);
  assert.equal(loadConfig({ ...env, ANOTAAI_ACTIONS: 'off' }).actions, false);
  assert.throws(() => loadConfig({ ...env, ANOTAAI_POLL_INTERVAL_MS: '10000' }), /30000/);
  assert.throws(() => parsePages(JSON.stringify([{ pageId: 'x', brand: 'barbacue' }])), /pageId/);
  assert.throws(() => parsePages(JSON.stringify([{ pageId: PAGE.pageId, brand: 'outra' }])), /marca/);
  assert.throws(() => parsePages(JSON.stringify([PAGE, PAGE])), /repetido/);
});

test('mapeia o pedido para a linha de orders com marca, itens, troco e id estável', () => {
  const o = toBarbacueOrder(detail(NEW), PAGE);
  assert.equal(o.id, anotaLocalId(NEW)); assert.equal(o.brand, 'barbadog'); assert.equal(o.orderType, 'delivery');
  assert.deepEqual(o.items[0], { name: 'Hot dog', qty: 2, priceCents: 1500, notes: 'sem cebola; Bacon' });
  assert.equal(o.total, 3500); assert.equal(o.fee, 500); assert.equal(o.paymentMethod, 'cash'); assert.equal(o.changeForCents, 5000); assert.equal(o.paid, false);
  assert.match(o.notes, /Anota AI #77/); assert.match(o.notes, /Loja Anota AI: Barbadog/);
  assert.equal(o.customerPhone, '5547999990000');
  assert.deepEqual([0, -2, 1, 2, 3, 4, 5, 6].map(localOfCheck), ['pending', 'confirmed', 'confirmed', 'ready', 'delivered', 'cancelled', 'cancelled', null]);
  assert.throws(() => toBarbacueOrder({ ...detail(NEW), items: [{ name: 'x', quantity: 0.5, total: 1 }] }, PAGE), /Quantidade/);
});

test('sincroniza: importa, ignora encerrados, aplica status remoto e envia ações do painel', async () => {
  Object.assign(remote, { [NEW]: 0, [OLD]: 3, [LOCAL]: 0, [REMOTE]: 0, [ASK]: 1 });
  const client = new AnotaClient({ clientId: 'c', clientSecret: 's' });
  const store = memStore();
  const cfg = { actions: true, dryRun: false };
  let r = await syncPage(client, store, PAGE, cfg);
  assert.deepEqual(r, { created: 4, updated: 0, pushed: 0, errors: [] });
  assert.equal(store.rows.has(anotaLocalId(OLD)), false);
  assert.equal(store.rows.get(anotaLocalId(ASK)).status, 'confirmed');
  // Toda requisição leva Content-Length, User-Agent e excludeIfood=1 na listagem.
  assert.ok(calls.every(c => c.len !== undefined && /^barbacue-anotaai\/1\.0/.test(c.ua)));
  assert.ok(calls.filter(c => c.p.endsWith('/ping/list')).every(c => c.q.includes('excludeIfood=1')));
  assert.equal(tokens, 1); // token reaproveitado

  store.rows.get(anotaLocalId(LOCAL)).status = 'ready';      // cozinha avançou no painel
  store.rows.get(anotaLocalId(NEW)).status = 'cancelled';    // loja cancelou no painel
  remote[REMOTE] = 2;                                        // marcado pronto na Anota AI
  remote[ASK] = 6;                                           // cliente pediu cancelamento
  r = await syncPage(client, store, PAGE, cfg);
  assert.deepEqual(r, { created: 0, updated: 1, pushed: 3, errors: [] });
  assert.equal(remote[LOCAL], 2); assert.equal(remote[NEW], 4);
  assert.match(calls.find(c => c.p.includes('/order/cancel/')).body, /justification/);
  assert.equal(store.rows.get(anotaLocalId(REMOTE)).status, 'ready');
  assert.ok(store.rows.get(anotaLocalId(ASK)).notes.includes(CANCEL_REQUESTED));

  r = await syncPage(client, store, PAGE, cfg); // idempotente
  assert.deepEqual(r, { created: 0, updated: 0, pushed: 0, errors: [] });
});

test('ações desligadas e dry run não mudam a Anota AI nem o banco', async () => {
  const id = '66b6258e890ffb00126c4400'; remote[id] = 0;
  const client = new AnotaClient({ clientId: 'c', clientSecret: 's' });
  const store = memStore();
  await syncPage(client, store, PAGE, { actions: false, dryRun: false });
  store.rows.get(anotaLocalId(id)).status = 'ready';
  const before = calls.length;
  const r = await syncPage(client, store, PAGE, { actions: false, dryRun: false });
  assert.equal(r.pushed, 0); assert.equal(remote[id], 0);
  assert.ok(calls.slice(before).every(c => !c.p.includes('/order/')));
  const dry = memStore();
  assert.equal((await syncPage(client, dry, PAGE, { actions: true, dryRun: true })).created, 0);
  assert.equal(dry.rows.size, 0);
});

test('success:false vira erro e não derruba os outros pedidos', async () => {
  const client = new AnotaClient({ clientId: 'c', clientSecret: 's' });
  await assert.rejects(syncPage(client, memStore(), { ...PAGE, pageId: '65d4a42543b0de0019666dff' }, { actions: true, dryRun: false }), /x-page-id inválido/);
});

test('corte de importação: pedidos anteriores ao início não entram (nem sem data)', async () => {
  const { parseSince } = require('../src/config.ts');
  const id = '66b6258e890ffb00126c4401'; remote[id] = 0;
  const client = new AnotaClient({ clientId: 'c', clientSecret: 's' });
  const store = memStore();
  const r = await syncPage(client, store, PAGE, { actions: false, dryRun: false, importSince: Date.now() + 86_400_000 });
  assert.equal(r.created, 0);
  assert.equal(store.rows.size, 0);
  assert.equal(parseSince('2026-11-09T17:00:00Z'), Date.parse('2026-11-09T17:00:00Z'));
  assert.equal(parseSince('', 123), 123);
  assert.throws(() => parseSince('ontem'), /ISO/);
});

test('ação recusada pela Anota AI vira nota no pedido (sem repetir) e não para os demais', async () => {
  for (const k of Object.keys(remote)) delete remote[k];
  const ok = '66b6258e890ffb00126c4304';
  Object.assign(remote, { [REJECT]: 0, [ok]: 0 });
  const client = new AnotaClient({ clientId: 'c', clientSecret: 's' });
  const store = memStore();
  const cfg = { actions: true, dryRun: false };
  await syncPage(client, store, PAGE, cfg);
  store.rows.get(anotaLocalId(REJECT)).status = 'ready';
  store.rows.get(anotaLocalId(ok)).status = 'confirmed';
  let r = await syncPage(client, store, PAGE, cfg);
  assert.equal(r.pushed, 1); assert.equal(remote[ok], 1); assert.equal(remote[REJECT], 0);
  assert.equal(r.errors.length, 1); assert.match(r.errors[0], /ação accept recusada/);
  const note = actionFailedNote('accept', 'Anota AI POST /x 200: Pedido já foi negado');
  assert.match(note, /não registrou "aceitar": Pedido já foi negado/);
  assert.ok(store.rows.get(anotaLocalId(REJECT)).notes.includes(note));
  r = await syncPage(client, store, PAGE, cfg);
  assert.equal(store.rows.get(anotaLocalId(REJECT)).notes.split(note).length, 2); // nota única
  assert.equal(calls.filter(c => c.p.endsWith(`/order/ready/${REJECT}`)).length, 0); // parou no aceite recusado
});

test('pedido de dia anterior fora da listagem é conferido por /ping/get e fecha no painel', async () => {
  for (const k of Object.keys(remote)) delete remote[k];
  const old = '66b6258e890ffb00126c4305', open = '66b6258e890ffb00126c4306';
  Object.assign(remote, { [old]: 2, [open]: 2 });
  const client = new AnotaClient({ clientId: 'c', clientSecret: 's' });
  const store = memStore();
  const cfg = { actions: true, dryRun: false };
  await syncPage(client, store, PAGE, cfg);
  assert.equal(store.rows.get(anotaLocalId(old)).status, 'ready');
  hidden.add(old); hidden.add(open); remote[old] = 3;      // virou o dia; finalizado na Anota AI
  const r = await syncPage(client, store, PAGE, cfg);
  assert.equal(r.updated, 1); assert.deepEqual(r.errors, []);
  assert.equal(store.rows.get(anotaLocalId(old)).status, 'delivered');
  assert.equal(store.rows.get(anotaLocalId(open)).status, 'ready');
  store.rows.get(anotaLocalId(open)).status = 'delivered';  // concluído no painel depois da virada
  // concluído no painel: não está mais aberto, então não é conferido (o envio vale só enquanto está na listagem)
  const before = calls.length;
  await syncPage(client, store, PAGE, cfg);
  assert.ok(calls.slice(before).every(c => !c.p.includes(`/ping/get/${open}`)));
  hidden.clear();
});
