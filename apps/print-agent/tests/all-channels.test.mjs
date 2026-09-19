import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatTicket } from '../src/ticket.mjs';
const fixture = JSON.parse(await readFile(new URL('../examples/ticket.json', import.meta.url)));
for (const channel of ['click', 'chat', 'ifood', 'telefone', 'parceiro-novo', 'test']) test(`version 2 prints ${channel}, payment and delivery without losing notes`, () => {
  const value = { ...fixture, version: 2, channel, orderType: 'delivery', customerName: 'João', customerPhone: '11900001111', deliveryAddress: 'Rua A, 123', totalCents: 5990, deliveryFeeCents: 500, payment: { method: 'pix', status: 'paid' }, status: 'pending' };
  for (const columns of [32, 48]) {
    const text = formatTicket(value, { columns });
    assert.match(text, /Cliente: Joao/); assert.match(text, /Rua A, 123/); assert.match(text, /PAGO/); assert.match(text, /59,90/); assert.match(text, /PEDIDO PENDENTE/);
    assert.doesNotMatch(text, /PAGAMENTO PENDENTE/);
    assert.ok(text.split('\n').every(line => line.length <= columns));
  }
});
test('version 2 validates totals and permits external dine in without table', () => {
  const value = { ...fixture, version: 2, channel: 'ifood', tableNumber: null };
  assert.match(formatTicket(value), /NO LOCAL/);
  assert.throws(() => formatTicket({ ...value, totalCents: -1 }));
  assert.throws(() => formatTicket({ ...value, payment: { status: 'unknown' } }));
});
