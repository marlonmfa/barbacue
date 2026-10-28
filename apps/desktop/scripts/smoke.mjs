import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { modules } from '../src/modules.mjs';
import { localOrigin } from '../src/api-client.mjs';
import { startFixture } from './fixture-api.mjs';

const directory = await mkdtemp(`${tmpdir()}/barbacue-api-smoke-`);
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../../../output/windows/', import.meta.url));
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const fixture = await startFixture();
const env = { ...process.env, BARBACUE_DESKTOP_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE;
let application;
async function appPage() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const page = application.context().pages().find(page => page.url().startsWith(localOrigin));
    if (page) return page;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('A interface local não abriu.');
}
async function login(page, username = 'admin') {
  await page.waitForURL(`${localOrigin}/admin/login`);
  await page.getByLabel('Usuário ou e-mail').fill(username);
  await page.getByLabel('Senha', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function navigate(page, id) {
  const item = modules.find(item => item.id === id);
  await page.getByRole('combobox', { name: 'Ir para', exact: true }).selectOption(id);
  await page.waitForURL(`${localOrigin}${item.path}`);
  await page.getByRole('status').filter({ hasText: 'API conectada' }).waitFor();
}
try {
  await mkdir(output, { recursive: true });
  application = await electron.launch({ args: [root], env });
  application.context().setDefaultTimeout(12_000); application.context().setDefaultNavigationTimeout(12_000);
  const setup = await application.firstWindow();
  await setup.getByText(`Versão ${version}`, { exact: true }).waitFor();
  await setup.locator('#serverUrl').fill(fixture.origin);
  await setup.getByRole('button', { name: 'Salvar configuração' }).click();
  await setup.getByText('Configuração salva. Use Abrir administração para entrar no sistema.').waitFor();
  await setup.getByRole('button', { name: 'Abrir administração' }).click();
  let page = await appPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await page.waitForURL(`${localOrigin}/admin`);
  await page.getByRole('heading', { name: 'Centro de comando' }).waitFor();
  assert.equal(await page.evaluate(() => typeof require), 'undefined');
  assert.equal(await page.evaluate(() => typeof process), 'undefined');
  assert.equal(await page.evaluate(() => document.cookie.includes('barbacue_admin')), false);
  console.log('PASS: local login uses online API and HttpOnly session stays outside the renderer.');
  for (const item of modules) {
    await navigate(page, item.id);
    await page.locator('#desktop-content h1').first().waitFor();
    assert.equal(await page.getByText('Não foi possível apresentar os dados recebidos. Confira a conexão e recarregue a função.', { exact: true }).count(), 0, `${item.id}: ${errors.join('; ')}`);
  }
  console.log('PASS: all 24 administrative functions render locally.');
  await navigate(page, 'catalogs');
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Salvar produto' }) });
  await form.locator('input[required]').nth(0).fill('Lanches');
  await form.locator('input[required]').nth(1).fill('Produto API desktop');
  await form.getByPlaceholder('29,90').fill('23,90');
  await form.getByRole('button', { name: 'Salvar produto' }).click();
  await page.getByRole('cell', { name: /Produto API desktop/ }).waitFor();
  assert.equal(fixture.state.catalogs[0].priceCents, 2390);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByPlaceholder('29,90').fill('25,50');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await page.getByRole('cell', { name: /25,50/ }).waitFor();
  assert.equal(fixture.state.catalogs[0].priceCents, 2550);
  const toggled = page.waitForResponse(r => r.url().includes('/api/admin/catalogs/barbacue/1') && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Disponível', exact: true }).click();
  await toggled;
  await page.getByRole('button', { name: 'Indisponível', exact: true }).waitFor();
  assert.equal(fixture.state.catalogs[0].available, false);
  await page.screenshot({ path: `${output}/produtos-api-windows.png` });
  await navigate(page, 'orders');
  await page.getByRole('button', { name: 'Quadros', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Quadros', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Cliente', exact: true }).waitFor();
  await page.getByRole('searchbox', { name: 'Buscar pedido' }).fill('cliente inexistente');
  assert.equal(await page.getByRole('button', { name: /^Ver pedido / }).count(), 0);
  await page.getByRole('searchbox', { name: 'Buscar pedido' }).fill('Cliente de teste');
  await page.getByRole('button', { name: 'Quadros', exact: true }).click();
  await page.getByRole('button', { name: /^Ver pedido / }).click();
  await page.getByRole('button', { name: 'Aceitar pedido', exact: true }).waitFor();
  const orderUpdated = page.waitForResponse(r => r.url().includes('/api/admin/orders/11111111') && r.request().method() === 'PATCH');
  await page.getByRole('dialog', { name: 'Detalhes do pedido' }).locator('select').selectOption('confirmed');
  await orderUpdated;
  await page.getByRole('dialog', { name: 'Detalhes do pedido' }).locator('select').filter({ has: page.locator('option[value="confirmed"]') }).waitFor();
  assert.equal(fixture.state.orders[0].status, 'confirmed');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.screenshot({ path: `${output}/pedidos-api-windows.png` });
  const upload = await page.evaluate(async () => {
    const form = new FormData(); form.set('file', new Blob(['fixture-image'], { type: 'image/png' }), 'produto.png');
    return (await fetch('/api/admin/upload', { method: 'POST', body: form })).json();
  });
  assert.equal(upload.url, '/api/media/fixture-image');
  assert.ok(fixture.state.requests.some(r => r.path === '/api/admin/upload' && r.cookie && r.type.startsWith('multipart/form-data')));
  fixture.state.tables = [{ id: 1, number: 7, label: 'Mesa de teste', active: true, token: '22222222-2222-4222-8222-222222222222' }];
  await navigate(page, 'tables');
  // Public QR links must use the online store, never the internal app scheme.
  const qrImage = page.getByAltText('QR Mesa 7');
  await qrImage.waitFor();
  const pixels = PNG.sync.read(Buffer.from((await qrImage.getAttribute('src')).split(',')[1], 'base64'));
  const matrix = QRCode.create(`${fixture.origin}/mesa/${fixture.state.tables[0].token}`).modules;
  const scale = pixels.width / (matrix.size + 2);
  for (let row = 0; row < matrix.size; row++) for (let col = 0; col < matrix.size; col++) {
    const x = Math.floor((col + 1.5) * scale), y = Math.floor((row + 1.5) * scale);
    assert.equal(pixels.data[(y * pixels.width + x) * 4] < 128, Boolean(matrix.data[row * matrix.size + col]), 'Printed QR must encode the online store URL');
  }
  const tableCall = await page.evaluate(async () => (await fetch('/api/admin/tables')).ok); assert.ok(tableCall);
  await page.getByRole('link', { name: 'Abrir tablet nesta mesa' }).click();
  await page.waitForURL(`${localOrigin}/totem?mesa=${fixture.state.tables[0].token}`);
  await page.getByText('Mesa 7', { exact: true }).first().waitFor();
  await navigate(page, 'downloads');
  const downloadedFile = `${directory}/fixture-download.exe`;
  await application.evaluate(({ session }, destination) => {
    session.fromPartition('persist:barbacue-desktop-ui').once('will-download', (_event, item) => item.setSavePath(destination));
  }, downloadedFile);
  await page.getByRole('link', { name: 'Baixar instalador disponibilizado no servidor' }).click();
  let downloadBytes;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { downloadBytes = await readFile(downloadedFile, 'utf8'); if (downloadBytes === 'desktop-download-fixture') break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(downloadBytes, 'desktop-download-fixture');
  assert.ok(fixture.state.requests.some(r => r.path === '/api/admin/downloads/windows' && r.cookie));
  await navigate(page, 'whatsapp');
  await page.getByRole('heading', { name: 'Conversas', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/atendimento-api-windows.png` });
  console.log('PASS: product creation/editing, availability, order update, multipart upload and service data use the API.');
  fixture.state.offline = true;
  await page.reload();
  await page.getByRole('heading', { name: 'Não foi possível acessar o sistema.' }).waitFor();
  await page.screenshot({ path: `${output}/reconexao-api-windows.png` });
  fixture.state.offline = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByRole('heading', { name: 'Conversas', exact: true }).waitFor();
  await application.close(); application = null;
  application = await electron.launch({ args: [root], env });
  application.context().setDefaultTimeout(12_000); application.context().setDefaultNavigationTimeout(12_000);
  page = await appPage();
  await page.getByRole('heading', { name: 'Olá, Equipe de teste', exact: true }).waitFor();
  assert.ok(fixture.state.requests.every(r => r.path.startsWith('/api/')), 'No online HTML or JavaScript requests allowed');
  fixture.state.forcedRole = 'kitchen';
  await page.reload();
  await page.getByRole('combobox', { name: 'Ir para', exact: true }).locator('option[value="kitchen"]').waitFor({ state: 'attached' });
  assert.equal(await page.getByRole('combobox', { name: 'Ir para', exact: true }).locator('option[value="catalogs"]').count(), 0);
  const forbidden = await page.evaluate(async () => (await fetch('/api/admin/products')).status);
  assert.equal(forbidden, 403);
  fixture.state.expired = true;
  await page.evaluate(async () => { await fetch('/api/admin/kitchen'); });
  await page.waitForURL(`${localOrigin}/admin/login`);
  fixture.state.forcedRole = null;
  await login(page, 'first');
  await page.waitForURL(`${localOrigin}/admin/change-password`);
  await page.getByLabel('Senha atual', { exact: true }).fill('fixture-password');
  await page.getByLabel('Nova senha', { exact: true }).fill('fixture-new-password');
  await page.getByLabel('Confirme a nova senha', { exact: true }).fill('fixture-new-password');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await page.waitForURL(`${localOrigin}/admin`);
  await page.getByRole('heading', { name: 'Centro de comando' }).waitFor();
  console.log('PASS: offline recovery, persistent online session, permission revocation, expiration and first-login password change.');
  assert.deepEqual(errors, []);
  console.log(`PASS: local UI + direct online API. ${fixture.state.requests.length} API requests; no online pages loaded. Fixture only.`);
} finally {
  if (application) await application.close();
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
}
