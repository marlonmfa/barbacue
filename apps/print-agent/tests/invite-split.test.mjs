import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTicket, escposBytes, splitByRestaurant, CUT_LINE, QR_PREFIX } from '../src/ticket.mjs';

const order = (over = {}) => ({ version: 2, brand: 'barbacue', orderNumber: 'AB12CD34', channel: 'click', orderType: 'delivery',
  customerName: 'Ana', items: [{ name: 'Smash', qty: 1 }], createdAt: '2026-11-10T13:00:00Z',
  subtotalCents: 1000, totalCents: 1000, payment: { status: 'paid', method: 'pix' }, ...over });

test('iFood and Anota AI tickets print the invite with QR before the order', () => {
  for (const channel of ['ifood', 'anotaai']) {
    const text = formatTicket(order({ channel, brand: 'chelas' }));
    const qr = text.indexOf(QR_PREFIX);
    assert.ok(qr > 0 && qr < text.indexOf('PEDIDO #'), channel);
    assert.match(text, /PECA DIRETO COM A GENTE!/);
    assert.match(text, /\[QR\] https:\/\/barbacue\.cog\.ia\.br\/chelas\?origem=comanda/);
  }
  assert.doesNotMatch(formatTicket(order({ channel: 'click' })), /PECA DIRETO|\[QR\]/);
});

test('multi-restaurant order prints one part per kitchen with the same code', () => {
  const t = order({ items: [{ name: 'Burrito', qty: 1, restaurant: 'Chelas' }, { name: 'Dog', qty: 2, restaurant: 'Barbadog' },
    { name: 'Smash', qty: 1, restaurant: 'Barbacue' }, { name: 'Coca', qty: 1 }] });
  assert.deepEqual(splitByRestaurant(t).map(p => [p.brand, p.items.map(i => i.name)]),
    [['chelas', ['Burrito']], ['barbacue', ['Smash', 'Coca']], ['barbadog', ['Dog']]]);
  const parts = formatTicket(t).split(CUT_LINE);
  assert.equal(parts.length, 3);
  parts.forEach((part, i) => {
    assert.match(part, /PEDIDO #AB12CD34/);
    assert.match(part, new RegExp(`PARTE ${i + 1} DE 3`));
  });
  assert.match(parts[0], /1x Burrito/); assert.doesNotMatch(parts[0], /Dog|Smash/);
  assert.match(parts[2], /2x Dog/);
  assert.equal(formatTicket(order()).includes('PARTE'), false);
});

test('ESC/POS prints a native QR, bold frames per part and cuts between parts', () => {
  const t = order({ channel: 'ifood', items: [{ name: 'Burrito', qty: 1, restaurant: 'Chelas' }, { name: 'Smash', qty: 1 }] });
  const bytes = escposBytes(formatTicket(t), { cut: true });
  const qrStore = Buffer.from([0x1d, 0x28, 0x6b]);
  let count = 0; for (let i = bytes.indexOf(qrStore); i >= 0; i = bytes.indexOf(qrStore, i + 1)) count++;
  assert.equal(count, 2 * 5); // 5 comandos GS ( k por QR, um QR por parte
  assert.equal(bytes.toString('latin1').split('\x1bE\x01').length - 1, 2);
  assert.equal(bytes.toString('latin1').split('\x1dV\x00').length - 1, 2); // entre as partes + final
  assert.doesNotMatch(bytes.toString('latin1'), /\[QR\]/);
});

test('plain-text queues drop the QR control line but keep the address', async () => {
  const { plainText } = await import('../src/ticket.mjs');
  const text = plainText(formatTicket(order({ channel: 'ifood' })));
  assert.doesNotMatch(text, /\[QR\]/);
  assert.match(text, /https:\/\/barbacue\.cog\.ia\.br\/\?origem=comanda/);
});
