import { createServer } from 'node:http';

export async function startFixture() {
  const state = { offline: false, expired: false, forcedRole: null, requests: [], catalogs: [], products: [], tables: [], chats: [] };
  const order = { id: '11111111-1111-4111-8111-111111111111', brand: 'barbacue', customerName: 'Cliente de teste', customerPhone: '5500000000000', orderType: 'pickup', items: [{ name: 'Lanche de teste', qty: 1, priceCents: 2000 }], subtotalCents: 2000, discountCents: 0, totalCents: 2000, deliveryFeeCents: 0, channel: 'click', status: 'pending', paymentMethod: 'cash', paymentStatus: 'pending', createdAt: '2026-10-24T00:00:00Z' };
  state.orders = [order];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture'), path = url.pathname;
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks); let body;
    try { body = JSON.parse(bytes.toString()); } catch { body = null; }
    state.requests.push({ path, query: url.search, method: req.method, body, bytes: bytes.length, cookie: Boolean(req.headers.cookie?.includes('barbacue_admin=')), type: req.headers['content-type'] });
    if (state.offline) { req.socket.destroy(); return; }
    const json = (value, status = 200, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(value)); };
    if (!path.startsWith('/api/')) return json({ error: 'O aplicativo não deve solicitar HTML online.' }, 500);
    const cookie = /barbacue_admin=([a-z]+)/.exec(req.headers.cookie || '')?.[1];
    const account = cookie && !state.expired ? { userId: 1, name: 'Equipe de teste', role: state.forcedRole || (cookie === 'kitchen' ? 'kitchen' : 'admin'), permissions: state.forcedRole === 'kitchen' || cookie === 'kitchen' ? ['kitchen'] : null, mustChangePassword: cookie === 'first' } : null;
    if (path === '/api/admin/auth') {
      if (req.method === 'POST') { state.expired = false; return json({ ok: true, role: body?.username === 'kitchen' ? 'kitchen' : 'admin', mustChangePassword: body?.username === 'first' }, 200, { 'set-cookie': `barbacue_admin=${['kitchen', 'first'].includes(body?.username) ? body.username : 'admin'}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600` }); }
      if (req.method === 'DELETE') return json({ ok: true }, 200, { 'set-cookie': 'barbacue_admin=; Path=/; HttpOnly; Max-Age=0' });
      return account ? json({ session: account, desktopApiVersion: 1 }) : json({ error: 'Não autenticado' }, 401);
    }
    if (!account) return json({ error: 'Não autenticado' }, 401);
    if (path === '/api/admin/change-password') return json({ ok: true, redirect: '/admin' }, 200, { 'set-cookie': 'barbacue_admin=admin; Path=/; HttpOnly; Max-Age=3600' });
    if (account.role === 'kitchen' && !path.startsWith('/api/admin/kitchen')) return json({ error: 'Sem permissão' }, 403);
    if (path === '/api/admin/dashboard') return json({ metrics: { orders: 1, products: state.catalogs.length, customers: 0, coupons: 0 }, brands: [], recentOrders: [], pixConfigured: false, gmailConfigured: false });
    if (path === '/api/admin/catalogs' && req.method === 'POST') { const product = { ...body, id: state.catalogs.length + 1, source: 'manual' }; state.catalogs.push(product); return json(product, 201); }
    if (path === '/api/admin/catalogs') return json(state.catalogs);
    if (/^\/api\/admin\/catalogs\/[^/]+\/\d+$/.test(path)) { const id = Number(path.split('/').at(-1)); const p = state.catalogs.find(p => p.id === id); if (req.method === 'DELETE') state.catalogs = state.catalogs.filter(p => p.id !== id); else Object.assign(p, body); return json(p || { ok: true }); }
    if (path === '/api/admin/products') return json({ categories: [{ id: 1, name: 'Lanches', sortOrder: 0 }], products: state.products });
    if (path === '/api/admin/orders') return json(url.searchParams.has('drivers') ? { drivers: [] } : state.orders);
    if (path === '/api/admin/waiter') return json({ tables: [], orders: [] });
    if (path === `/api/admin/orders/${order.id}`) { Object.assign(order, body); return json(order); }
    if (path === '/api/admin/kitchen/printers') return json({ devices: [], routes: [] });
    if (path === '/api/admin/kitchen/printing') return json({ configured: false, online: false, jobs: [], totalPending: 0 });
    if (path === '/api/admin/ifood') return json({ configured: false, dryRun: true, stores: [], orders: [] });
    if (path === '/api/admin/settings') return json({ storeName: 'Barbacue de teste', isOpen: true });
    if (path === '/api/admin/delivery-settings') return json({ settings: { enabled: false, provider: 'osm', originAddress: null, originLatitude: null, originLongitude: null, baseFeeCents: 0, feePerKmCents: 0, minFeeCents: 0, maxDistanceMeters: 5000 }, providers: { osm: { configured: false } } });
    if (path === '/api/admin/system') return json({ openai: { configured: false }, gmail: { configured: false }, pix: { configured: false }, sessionSecret: { configured: true }, whatsappBot: { configured: false }, nodeEnv: 'test' });
    if (path === '/api/admin/erp') return json(Object.fromEntries(['suppliers', 'ingredients', 'purchases', 'recipes', 'movements', 'finance', 'payroll', 'attendance', 'leaves', 'employees', 'sales', 'audit'].map(key => [key, []])));
    if (path === '/api/admin/whatsapp/accounts') return json({ accounts: [] });
    if (path === '/api/admin/whatsapp/chats') return json({ chats: state.chats });
    if (path === '/api/admin/whatsapp/messages') return json({ messages: [] });
    if (path === '/api/admin/tables') return json(state.tables);
    if (path === '/api/store-status') return json({ open: true, reason: '', nextOpen: null });
    if (path === '/api/tables/resolve') return json({ number: 7, token: url.searchParams.get('token'), label: 'Mesa de teste' });
    if (path === '/api/admin/upload') return json({ url: '/api/media/fixture-image' });
    if (path === '/api/admin/downloads/windows') { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="teste-windows.exe"' }); res.end('desktop-download-fixture'); return; }
    if (path === '/api/account') return json({ name: 'Cliente selecionado' });
    return json([]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
