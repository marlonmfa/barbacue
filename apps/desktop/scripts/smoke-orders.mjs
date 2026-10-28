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
  await page.getByRole('button', { name: 'Aceitar pedido', exact: true }).click();
  await orderUpdated;
  await page.getByRole('dialog', { name: 'Detalhes do pedido' }).locator('select').filter({ has: page.locator('option[value="confirmed"]') }).waitFor();
  assert.equal(fixture.state.orders[0].status, 'confirmed');
  await page.screenshot({ path: `${output}/gestor-pedido-detalhe.png` });
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.screenshot({ path: `${output}/pedidos-api-windows.png` });
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Cliente', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/gestor-pedidos-lista.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: quadros, lista, busca em ambas as visões, detalhe lateral e aceite confirmado pela API.');
} finally {
  if (application) await application.close();
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
}
