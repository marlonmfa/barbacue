import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketHtml } from '../src/printing.mjs';
import { formatTicket } from '../../print-agent/src/ticket.mjs';

test('desktop prints the restaurant frame inverted, above the order body', () => {
  const text = formatTicket({ version: 2, brand: 'barbadog', orderNumber: 'AB12CD34', channel: 'ifood', orderType: 'pickup',
    items: [{ name: 'Dog', qty: 1 }], createdAt: '2026-11-10T13:00:00Z', subtotalCents: 1000, totalCents: 1000,
    payment: { status: 'paid', method: 'pix' } });
  const html = ticketHtml(text, 80);
  const banner = html.match(/<pre class="banner">([\s\S]*?)<\/pre>/)?.[1] ?? '';
  assert.match(banner, /BARBADOG/);
  assert.equal(banner.split('\n').length, 5);
  assert.match(html, /pre\.banner\{[^}]*background:#000/);
  assert.ok(html.indexOf('PEDIDO #AB12CD34') > html.indexOf('</pre>'));
});

test('text without a frame is printed unchanged', () => {
  assert.doesNotMatch(ticketHtml('linha simples', 80), /class="banner"/);
});

test('desktop renders the invite QR as local SVG and frames every part', async () => {
  const text = formatTicket({ version: 2, brand: 'barbacue', orderNumber: 'AB12CD34', channel: 'anotaai', orderType: 'pickup',
    items: [{ name: 'Burrito', qty: 1, restaurant: 'Chelas' }, { name: 'Smash', qty: 1 }], createdAt: '2026-11-10T13:00:00Z',
    subtotalCents: 1000, totalCents: 1000, payment: { status: 'paid', method: 'pix' } });
  const html = ticketHtml(text, 80);
  assert.equal(html.match(/<pre class="banner">/g).length, 2);
  assert.equal(html.match(/<div class="qr"><svg/g).length, 2);
  assert.match(html, /<pre class="cut">/);
  assert.doesNotMatch(html, /\[QR\]/);
  assert.doesNotMatch(html, /src="http/);
});
