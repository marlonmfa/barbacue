import { chromium } from 'playwright';
import pg from 'pg';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = 'http://127.0.0.1:3099';
const pool = new pg.Pool({ connectionString: 'postgresql://127.0.0.1/barbacue_desktop_test_20260910' });
const browser = await chromium.launch({ headless: true });
const stamp = `visual-${Date.now()}`;
let id;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(`${base}/api/admin/auth`, { data: { password: 'Desktop-test-20260910' } });
  assert.equal(login.status(), 200);
  // Production cookies require HTTPS; this isolated loopback harness supplies
  // the same session explicitly without changing the application's policy.
  const sessionCookie = login.headers()['set-cookie'].split(';')[0].split('=');
  await context.addCookies([{ name: sessionCookie[0], value: sessionCookie.slice(1).join('='), url: base, httpOnly: true, secure: false }]);
  const imported = await context.request.post(`${base}/api/admin/orders/import`, { data: { orders: [{ source: 'telefone', externalId: stamp, customerName: 'Cliente demonstração', orderType: 'pickup', items: [{ name: 'Combo da casa', qty: 2, priceCents: 2590, notes: 'Sem cebola' }] }] } });
  assert.equal(imported.status(), 200);
  id = (await pool.query('SELECT id FROM orders WHERE notes LIKE $1', [`%${stamp}%`])).rows[0].id;
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/admin/orders`);
  await page.getByRole('row').filter({ hasText: 'Cliente demonstração' }).waitFor();
  await page.getByLabel('Origem do pedido').selectOption('telefone');
  await page.getByRole('button', { name: `Ver pedido ${id.slice(0, 8)}` }).click();
  await page.getByRole('dialog').waitFor();
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.getByRole('button', { name: 'Imprimir pedido', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__printed), true);
  await mkdir('output/windows', { recursive: true });
  await page.screenshot({ path: 'output/windows/pedidos-navegador.png' });
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByLabel(`Status do pedido ${id.slice(0, 8)}`).selectOption('confirmed');
  await page.waitForFunction(() => document.querySelector('select[aria-label^="Status do pedido"]')?.value === 'confirmed');
  await page.getByText('Pedidos de outras fontes', { exact: true }).click();
  await page.getByRole('button', { name: 'Importar pedidos', exact: true }).waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: browser login, order list, origin filter, detail, existing print action, status update and import UI.');
} finally {
  await browser.close();
  if (id) { await pool.query('DELETE FROM kitchen_print_jobs WHERE order_id=$1', [id]); await pool.query('DELETE FROM orders WHERE id=$1', [id]); }
  await pool.end();
}
