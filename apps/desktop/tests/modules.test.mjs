import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { modules, moduleGroups, modulePath, moduleForUrl } from '../src/modules.mjs';
import { canRequestLocalAudio, localOrigin } from '../src/api-client.mjs';

test('every administrative shortcut maps to an existing site page', async () => {
  assert.equal(new Set(modules.map(item => item.id)).size, modules.length);
  assert.equal(new Set(modules.map(item => item.path)).size, modules.length);
  for (const item of modules) {
    await access(new URL(`../../web/src/app${item.path}/page.tsx`, import.meta.url));
    assert.equal(modulePath(item.id), item.path);
  }
});
test('desktop covers every function linked by the web administration', async () => {
  const source = await readFile(new URL('../../web/src/components/admin/AdminShell.tsx', import.meta.url), 'utf8');
  const paths = [...source.matchAll(/href: "([^"]+)"/g)].map(match => match[1]);
  assert.ok(paths.length > 20);
  for (const path of paths) assert.ok(modules.some(item => item.path === path), `Missing Windows function: ${path}`);
  assert.deepEqual(moduleGroups.map(group => group.label), ['Operação', 'Cardápios', 'Gestão', 'Sistema']);
});
test('only known module identities can request navigation through the local bridge', () => {
  for (const id of ['https://evil.test', '/admin', '../settings', null, {}, '__proto__']) assert.throws(() => modulePath(id));
  assert.equal(moduleForUrl('https://loja.example/admin/catalogs?brand=chelas').id, 'catalogs');
  assert.equal(moduleForUrl('https://loja.example/admin/products/3').id, 'products');
  assert.equal(moduleForUrl('https://loja.example/admin/login'), null);
});
test('microphone requires an audio-only main-frame request from the packaged UI', () => {
  const origin = localOrigin;
  const details = { isMainFrame: true, requestingUrl: `${origin}/teste_pedido`, mediaTypes: ['audio'] };
  assert.ok(canRequestLocalAudio('media', details, `${origin}/teste_pedido`));
  for (const change of [{ isMainFrame: false }, { requestingUrl: 'https://other.example' }, { mediaTypes: ['audio', 'video'] }, { mediaTypes: [] }, { mediaTypes: undefined }])
    assert.equal(canRequestLocalAudio('media', { ...details, ...change }, origin), false);
  assert.equal(canRequestLocalAudio('media', details, 'file:///local.html'), false);
  assert.equal(canRequestLocalAudio('notifications', details, origin), false);
});
