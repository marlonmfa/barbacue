import test from 'node:test';
import assert from 'node:assert/strict';
import { apiTarget, createOnlineApi, isLocalUrl, localOrigin, maxRequestBytes } from '../src/api-client.mjs';
const origin = 'https://loja.example';
const url = path => `${localOrigin}${path}`;
test('only known operations reach the configured HTTPS API', () => {
  assert.equal(apiTarget(url('/api/admin/orders?drivers=1'), 'GET', origin), `${origin}/api/admin/orders?drivers=1`);
  assert.equal(apiTarget(url('/api/admin/kitchen/printers'), 'PUT', origin), `${origin}/api/admin/kitchen/printers`);
  assert.equal(apiTarget(url('/api/admin/ifood/stores/store-id?interruption=a'), 'DELETE', origin), `${origin}/api/admin/ifood/stores/store-id?interruption=a`);
  for (const [path, method] of [['/admin/orders', 'GET'], ['/api/unknown', 'GET'], ['/api/admin/auth', 'PUT'], ['/api/admin/products/%2e%2e', 'GET'], ['/api/admin/products/a%2fb', 'PATCH']]) assert.throws(() => apiTarget(url(path), method, origin));
  for (const value of ['https://evil.test/api/admin/auth', 'barbacue-app://other/api/admin/auth', 'file:///api/admin/auth', 'barbacue-app://u:p@desktop/api/admin/auth']) assert.throws(() => apiTarget(value, 'POST', origin));
  assert.equal(isLocalUrl('https://desktop/admin'), false);
});
test('online cookies stay in the native session; renderer headers cannot inject credentials', async () => {
  let count = 0;
  const forward = createOnlineApi({ origin, fetch: async (target, init) => {
    count++; assert.equal(target, `${origin}/api/admin/auth`); assert.equal(init.credentials, 'include'); assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.get('cookie'), null); assert.equal(init.headers.get('authorization'), null);
    assert.equal(init.body.toString(), '{"username":"test","password":"fictional"}');
    return Response.json({ ok: true }, { headers: { 'set-cookie': 'session=private', 'x-private-header': 'private' } });
  } });
  const response = await forward(new Request(url('/api/admin/auth'), { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'injected', authorization: 'injected' }, body: '{"username":"test","password":"fictional"}' }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('x-private-header'), null); assert.equal(count, 1);
});
test('credentials and requests never follow server redirects or load server HTML', async () => {
  for (const reply of [() => new Response(null, { status: 302, headers: { location: 'https://evil.test' } }), () => new Response('<script>bad</script>', { headers: { 'content-type': 'text/html' } })]) {
    let calls = 0;
    const forward = createOnlineApi({ origin, fetch: async () => { calls++; return reply(); } });
    assert.equal((await forward(new Request(url('/api/admin/products')))).status, 502); assert.equal(calls, 1);
  }
});
test('mutations are not retried on uncertain network failure', async () => {
  let calls = 0;
  const forward = createOnlineApi({ origin, fetch: async () => { calls++; throw new Error('connection lost after sending'); } });
  const response = await forward(new Request(url('/api/admin/products'), { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503); assert.equal(calls, 1);
});
test('multipart bytes are forwarded unchanged and oversized requests never reach the API', async () => {
  const form = new FormData(); form.set('file', new Blob(['image-fixture'], { type: 'image/png' }), 'produto.png');
  const request = new Request(url('/api/admin/upload'), { method: 'POST', body: form });
  const bytes = Buffer.from(await request.clone().arrayBuffer());
  const forward = createOnlineApi({ origin, fetch: async (_target, init) => {
    assert.ok(init.body.equals(bytes)); assert.match(init.headers.get('content-type'), /^multipart\/form-data; boundary=/);
    return Response.json({ url: '/api/media/id' });
  } });
  assert.equal((await forward(request)).status, 200);
  const blocked = createOnlineApi({ origin, fetch: async () => { assert.fail('Oversized body must not leave the device'); } });
  assert.equal((await blocked(new Request(url('/api/admin/upload'), { method: 'POST', body: new Uint8Array(maxRequestBytes + 1) }))).status, 413);
});
test('server status, first-login password state and download headers survive the transport', async () => {
  const states = [];
  const forward = createOnlineApi({ origin, onResponse: value => states.push(value), fetch: async () => Response.json({ mustChangePassword: true }, { status: 403, headers: { 'retry-after': '10' } }) });
  const response = await forward(new Request(url('/api/admin/orders')));
  assert.equal(response.status, 403); assert.equal((await response.json()).mustChangePassword, true); assert.equal(response.headers.get('retry-after'), '10');
  assert.deepEqual(states, [{ path: '/api/admin/orders', status: 403 }]);
});
