import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const requests = [];
await page.route('**/api/chat', async route => {
  const body = route.request().postDataJSON(); requests.push(body);
  await route.fulfill({ json: { reply: `Anotado ${body.brand}`, cart: [{ productId: 1, name: `Produto ${body.brand}`, priceCents: 2500, qty: 1 }], customer: { name: 'Cliente', phone: '47999999999', address: 'Rua Um, 10' }, paymentMethod: 'pix', couponCode: null } });
});
await page.route('**/api/transcribe', route => route.fulfill({ json: { text: 'Quero dois burritos' } }));
try {
  for (const brand of ['chelas', 'barbacue', 'barbadog']) {
    await page.goto(`http://localhost:3018/atendimento/${brand}`);
    await page.getByRole('textbox', { name: 'Seu pedido' }).fill(`Pedido ${brand}`);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await page.getByText(`Anotado ${brand}`, { exact: true }).waitFor();
    const sent = requests.at(-1);
    assert.equal(sent.brand, brand); assert.equal(sent.cart.length, 0); assert.equal(sent.messages.length, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.getByRole('link', { name: 'Chelas', exact: true }).click();
  await page.getByText('Anotado chelas', { exact: true }).waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: 'pedido.wav', mimeType: 'audio/wav', buffer: Buffer.from('test') });
  await page.waitForFunction(() => document.querySelector('textarea').value === 'Quero dois burritos');
  assert.equal(requests.length, 3);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea').value === '');
  assert.equal(requests.at(-1).brand, 'chelas'); assert.equal(requests.at(-1).cart[0].name, 'Produto chelas');
  await page.route('**/api/chat', route => route.fulfill({ status: 502, json: { error: 'Falha temporária' } }));
  await page.getByRole('textbox', { name: 'Seu pedido' }).fill('texto preservado');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Seu pedido' }).inputValue(), 'texto preservado');
  await page.goto('http://localhost:3018/atendimento/invalida');
  await page.getByRole('heading', { name: '404', exact: true }).waitFor();
  console.log('PASS: brand isolation, draft restoration, editable audio, retry, mobile layout, invalid brand 404');
} finally { await browser.close(); }
