import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { run, main, createContext, findStore, findOrder, filterOrders, parseArgs, normalizeServer, readSessionCookie, mainState } from '../cli/ifood.mjs';

const STORES = [
  { id: '991532f5-0400-4efe-b38a-b2b37f8bd9b0', name: 'Chelas', brand: 'chelas', status: [{ operation: 'DELIVERY', state: 'OK' }], interruptions: [], error: null, forbidden: false },
  { id: '403af0c6-176b-4021-a6cd-3e09dca09cbf', name: 'Barbacue', brand: 'barbacue', status: [{ operation: 'DELIVERY', state: 'CLOSED' }], interruptions: [{ id: 'int-1', description: 'Pausa', start: '2026-10-23T10:00:00', end: '2026-10-23T10:30:00' }], error: null, forbidden: false },
  { id: '6cb73c63-55cd-459b-a02b-aa936967bf20', name: 'Hotdog', brand: 'barbadog', status: null, interruptions: null, error: 'Status indisponível: módulo Merchant', forbidden: true },
];
const order = (over) => ({ id: '11111111-2222-8333-a444-555555555555', brand: 'barbacue', customerName: 'Ana', customerPhone: '', orderType: 'delivery', deliveryAddress: 'Rua A, 1', items: [{ name: 'X-Barba', priceCents: 3500, qty: 2 }], subtotalCents: 7000, discountCents: 0, deliveryFeeCents: 800, totalCents: 7800, paymentMethod: 'ONLINE', paymentStatus: 'paid', status: 'pending', notes: null, createdAt: new Date().toISOString(), externalId: 'ext-aaaa-0001', displayId: '1234', storeId: STORES[1].id, actions: ['confirm', 'cancel'], ...over });
const ORDERS = [
  order({}),
  order({ id: '99999999-2222-8333-a444-555555555555', externalId: 'ext-bbbb-0002', displayId: '5678', status: 'confirmed', storeId: STORES[0].id, orderType: 'pickup', actions: ['startPreparation', 'readyToPickup', 'cancel'] }),
  order({ id: '77777777-2222-8333-a444-555555555555', externalId: 'ext-cccc-0003', displayId: '9012', status: 'delivered', storeId: STORES[2].id, actions: [] }),
];

function mockServer() {
  const calls = [];
  let orders = structuredClone(ORDERS);
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const url = new URL(req.url, 'http://x');
    calls.push({ method: req.method, path: url.pathname + url.search, body: body ? JSON.parse(body) : undefined, cookie: req.headers.cookie });
    const json = (status, data, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
    if (url.pathname === '/api/admin/auth' && req.method === 'POST') {
      const { username, password } = JSON.parse(body);
      if (password !== 'segredo') return json(401, { error: 'Credenciais inválidas' });
      return json(200, { ok: true, role: username ? 'cashier' : 'admin' }, { 'Set-Cookie': `barbacue_admin=tok-${calls.length}.sig; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (url.pathname === '/api/admin/auth' && req.method === 'DELETE') return json(200, { ok: true });
    if (!req.headers.cookie?.includes('barbacue_admin=tok-')) return json(401, { error: 'unauthorized' });
    if (url.pathname === '/api/admin/ifood') return json(200, { configured: true, dryRun: false, stores: STORES, orders });
    const om = url.pathname.match(/^\/api\/admin\/ifood\/orders\/([\w-]+)$/);
    if (om) {
      if (req.method === 'GET' && url.searchParams.get('reasons') === '1') return json(200, { reasons: [{ cancelCodeId: '501', description: 'Problemas de sistema' }, { cancelCodeId: '503', description: 'Item indisponível' }] });
      if (req.method === 'GET') return json(200, { order: { id: 'ext-aaaa-0001', orderStatus: 'PLACED' } });
      return json(200, { ok: true });
    }
    const sm = url.pathname.match(/^\/api\/admin\/ifood\/stores\/([\w-]+)$/);
    if (sm && req.method === 'POST') return json(200, { interruption: { id: 'int-new' } });
    if (sm && req.method === 'DELETE') return json(200, { ok: true });
    json(404, { error: 'not found' });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}`, setOrders: o => { orders = o; } })));
}

async function harness(t) {
  const mock = await mockServer();
  const home = await mkdtemp(join(tmpdir(), 'ifood-cli-'));
  t.after(async () => { mock.server.close(); await rm(home, { recursive: true, force: true }); });
  const out = []; const err = []; let beeps = 0;
  const env = { BARBACUE_IFOOD_HOME: home, BARBACUE_SERVER: mock.url };
  const answers = [];
  const ctx = createContext({ env, out: s => out.push(s), err: s => err.push(s), sleep: async () => {}, beep: () => { beeps++; }, io: { prompt: async () => answers.shift() ?? '', protect: async s => `prot:${s}`, unprotect: async s => s.replace(/^prot:/, '') } });
  return { ...mock, home, out, err, ctx, env, answers, beeps: () => beeps, cli: argv => main(argv, ctx) };
}

test('argument parsing, server validation and cookie parsing', () => {
  assert.deepEqual(parseArgs(['pedidos', '--loja', 'chelas', '--json']), { command: 'pedidos', args: [], flags: { loja: 'chelas', json: true } });
  assert.deepEqual(parseArgs(['cancelar', '#12', '--motivo=501', '--sim']).flags, { motivo: '501', sim: true });
  assert.throws(() => parseArgs(['pausar', 'chelas', '--minutos']));
  assert.equal(normalizeServer('https://barbacue.cog.ia.br/'), 'https://barbacue.cog.ia.br');
  for (const bad of ['http://barbacue.cog.ia.br', 'https://u:p@x.com', 'https://x.com/admin', 'nada']) assert.throws(() => normalizeServer(bad));
  const headers = new Headers(); headers.append('set-cookie', 'other=1; Path=/'); headers.append('set-cookie', 'barbacue_admin=abc.def; Path=/; HttpOnly');
  assert.equal(readSessionCookie(headers), 'abc.def');
});

test('store and order lookup by name, brand, code and prefix', () => {
  assert.equal(findStore(STORES, 'hotdog').name, 'Hotdog');
  assert.equal(findStore(STORES, 'barbadog').name, 'Hotdog');
  assert.equal(findStore(STORES, 'CHELAS').name, 'Chelas');
  assert.equal(findStore(STORES, 'barb').name, 'Barbacue');
  assert.equal(findStore(STORES, '403af0c6').name, 'Barbacue');
  assert.throws(() => findStore(STORES, 'pizzaria'), /não encontrada/);
  assert.equal(findOrder(ORDERS, '#1234').displayId, '1234');
  assert.equal(findOrder(ORDERS, 'ext-bbbb-0002').displayId, '5678');
  assert.equal(findOrder(ORDERS, '7777').displayId, '9012');
  assert.throws(() => findOrder(ORDERS, '#0000'), /não encontrado/);
  assert.equal(filterOrders(ORDERS, { status: 'ativos' }).length, 2);
  assert.equal(filterOrders(ORDERS, { store: STORES[0] }).length, 1);
  assert.equal(mainState(STORES[2]), 'UNAVAILABLE');
});

test('login stores session, commands reuse it, logout removes it', async t => {
  const h = await harness(t);
  assert.equal(await h.cli(['lojas']), 4);
  assert.equal(await h.cli(['login', '--usuario', 'caixa']), 1); // senha vazia
  h.answers.push('errada');
  assert.equal(await h.cli(['login', '--usuario', 'caixa']), 4);
  h.answers.push('segredo');
  assert.equal(await h.cli(['login', '--usuario', 'caixa']), 0);
  const saved = JSON.parse(await readFile(join(h.home, 'ifood-cli.json'), 'utf8'));
  assert.equal(saved.username, 'caixa'); assert.match(saved.cookie, /^tok-/); assert.equal(saved.protectedPassword, undefined);
  assert.equal(await h.cli(['lojas']), 0);
  assert.match(h.out.at(-1), /Hotdog\s+Status indisponível/);
  assert.match(h.out.at(-1), /Pausa int-1/);
  assert.equal(await h.cli(['status']), 0);
  assert.match(h.out.at(-1), /Modo:\s+real/);
  assert.equal(await h.cli(['logout']), 0);
  assert.equal(await h.cli(['pedidos']), 4);
});

test('orders: list, filter, details, actions validated against allowed steps', async t => {
  const h = await harness(t);
  h.answers.push('segredo');
  await h.cli(['login', '--usuario', 'caixa']);
  assert.equal(await h.cli(['pedidos']), 0);
  assert.match(h.out.at(-1), /#1234.*Barbacue.*Aguardando confirmação.*R\$ 78,00.*confirmar, cancelar/);
  assert.equal(await h.cli(['pedidos', '--loja', 'chelas', '--json']), 0);
  assert.deepEqual(JSON.parse(h.out.at(-1)).map(o => o.displayId), ['5678']);
  assert.equal(await h.cli(['pedido', '1234', '--ifood']), 0);
  assert.match(h.out.at(-1), /2x X-Barba\s+R\$ 70,00/);
  assert.match(h.out.at(-1), /PLACED/);
  assert.equal(await h.cli(['preparar', '#1234']), 1);
  assert.match(h.err.at(-1), /Ações possíveis: confirmar, cancelar/);
  assert.equal(await h.cli(['confirmar', '#1234']), 0);
  assert.deepEqual(h.calls.at(-1), { method: 'POST', path: `/api/admin/ifood/orders/${ORDERS[0].id}`, body: { action: 'confirm' }, cookie: h.calls.at(-1).cookie });
  assert.equal(await h.cli(['preparar', '5678']), 0);
  assert.equal(h.calls.at(-1).body.action, 'startPreparation');
  assert.equal(await h.cli(['pronto', '5678']), 0);
  assert.equal(h.calls.at(-1).body.action, 'readyToPickup');
  assert.equal(await h.cli(['despachar', '5678']), 1); // retirada não despacha
  assert.equal(await h.cli(['confirmar', '#9012']), 1);
  assert.match(h.err.at(-1), /Não há ações/);
  assert.equal(await h.cli(['pedido', '#4321']), 2);
});

test('cancel requires a valid iFood reason and explicit confirmation', async t => {
  const h = await harness(t);
  h.answers.push('segredo');
  await h.cli(['login', '--usuario', 'caixa']);
  assert.equal(await h.cli(['motivos', '#1234']), 0);
  assert.match(h.out.at(-1), /501\s+Problemas de sistema/);
  assert.equal(await h.cli(['cancelar', '#1234']), 1);
  assert.match(h.err.at(-1), /--motivo/);
  assert.equal(await h.cli(['cancelar', '#1234', '--motivo', '999', '--sim']), 1);
  h.answers.push('nao');
  assert.equal(await h.cli(['cancelar', '#1234', '--motivo', '503']), 1);
  const posts = h.calls.filter(c => c.method === 'POST' && c.path.includes('/orders/')).length;
  assert.equal(posts, 0);
  h.answers.push('sim');
  assert.equal(await h.cli(['cancelar', '#1234', '--motivo', '503', '--texto', 'Acabou o pão']), 0);
  assert.deepEqual(h.calls.at(-1).body, { action: 'cancel', cancellationCode: '503', reason: 'Acabou o pão' });
});

test('pause and resume stores', async t => {
  const h = await harness(t);
  h.answers.push('segredo');
  await h.cli(['login', '--usuario', 'caixa']);
  assert.equal(await h.cli(['pausar', 'chelas', '--minutos', '45', '--motivo', 'Sem entregador']), 0);
  assert.deepEqual(h.calls.at(-1), { method: 'POST', path: `/api/admin/ifood/stores/${STORES[0].id}`, body: { minutes: 45, description: 'Sem entregador' }, cookie: h.calls.at(-1).cookie });
  assert.equal(await h.cli(['pausar', 'chelas', '--minutos', '2']), 1);
  assert.equal(await h.cli(['reabrir', 'barbacue']), 0);
  assert.equal(h.calls.at(-1).path, `/api/admin/ifood/stores/${STORES[1].id}?interruption=int-1`);
  assert.equal(await h.cli(['reabrir', 'chelas']), 2);
  assert.equal(await h.cli(['reabrir', 'hotdog']), 1);
  assert.match(h.err.at(-1), /módulo Merchant/);
});

test('remembered password renews an expired session automatically', async t => {
  const h = await harness(t);
  h.answers.push('segredo');
  await h.cli(['login', '--usuario', 'caixa', '--lembrar']);
  const saved = JSON.parse(await readFile(join(h.home, 'ifood-cli.json'), 'utf8'));
  assert.equal(saved.protectedPassword, 'prot:segredo');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(h.home, 'ifood-cli.json'), JSON.stringify({ ...saved, cookie: 'expirado' }));
  assert.equal(await h.cli(['pedidos']), 0);
  const renewed = JSON.parse(await readFile(join(h.home, 'ifood-cli.json'), 'utf8'));
  assert.notEqual(renewed.cookie, 'expirado');
});

test('monitor announces new pending orders and status changes', async t => {
  const h = await harness(t);
  h.answers.push('segredo');
  await h.cli(['login', '--usuario', 'caixa']);
  const snapshots = [ORDERS, [...ORDERS, order({ id: '33333333-2222-8333-a444-555555555555', externalId: 'ext-dddd-0004', displayId: '3333' })], [order({ status: 'confirmed', actions: [] }), ...ORDERS.slice(1)]];
  let n = 0;
  h.setOrders(snapshots[0]);
  h.ctx.sleep = async () => { n++; if (n >= snapshots.length) throw Object.assign(new Error('stop'), { stop: true }); h.setOrders(snapshots[n]); };
  const code = await main(['monitorar'], h.ctx);
  assert.equal(code, 1); // encerrado pelo teste
  const text = h.out.join('\n');
  assert.match(text, /Monitorando as lojas/);
  assert.match(text, /NOVO PEDIDO #3333/);
  assert.match(text, /#1234 Aguardando confirmação → Confirmado/);
  assert.equal(h.beeps(), 1);
  assert.equal(await run(['monitorar', '--uma-vez', '--json'], h.ctx), 0);
});

test('Windows wrapper runs the CLI through Electron as Node', async () => {
  const cmd = await readFile(fileURLToPath(new URL('../cli/ifood.cmd', import.meta.url)), 'utf8');
  assert.match(cmd, /ELECTRON_RUN_AS_NODE=1/);
  assert.match(cmd, /Barbacue Pedidos\.exe/);
  assert.match(cmd, /resources\\cli\\ifood\.mjs/);
  const pkg = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.ok(pkg.build.extraResources.some(r => r.from === 'cli' && r.to === 'cli'));
  assert.equal(pkg.build.nsis.include, 'build/installer.nsh');
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../cli/ifood.mjs', import.meta.url)), '--versao']);
  assert.match(stdout, /^\d+\.\d+\.\d+/);
});

test('CLI runs when started through a symlinked path', async t => {
  const { symlink } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'ifood-link-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const link = join(dir, 'cli');
  await symlink(fileURLToPath(new URL('../cli', import.meta.url)), link, 'junction');
  const { stdout } = await promisify(execFile)(process.execPath, [join(link, 'ifood.mjs'), 'versao']);
  assert.match(stdout, /^\d+\.\d+\.\d+/);
});
