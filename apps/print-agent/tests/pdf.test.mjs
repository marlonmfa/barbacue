import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTicket } from '../src/ticket.mjs';
import { ticketPdf, ticketParts } from '../src/pdf.mjs';

const ticket = { version: 2, brand: 'barbacue', orderNumber: 'AB12CD34', channel: 'ifood', orderType: 'delivery', customerName: 'Ana (teste)',
  items: [{ name: 'Burrito', qty: 1, restaurant: 'Chelas' }, { name: 'Smash', qty: 1 }], createdAt: '2026-11-10T22:00:00Z',
  subtotalCents: 1000, totalCents: 1000, payment: { status: 'paid', method: 'pix' } };
const fakeQr = () => ({ size: 21, get: (x, y) => (x + y) % 2 === 0 });

test('one PDF per kitchen part, 80 mm wide, with text, frame and QR', () => {
  const parts = ticketParts(formatTicket(ticket));
  assert.equal(parts.length, 2);
  const pdf = ticketPdf(parts[0], { paper: 80, qr: fakeQr }).toString('latin1');
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/MediaBox \[0 0 226\.77 /);
  assert.match(pdf, /\(PARTE 1 DE 2 - CHELAS\) Tj/);
  assert.match(pdf, /\(Cliente: Ana \\\(teste\\\)\) Tj/); // parenteses escapados
  assert.match(pdf, /1 g BT \/F2/);                      // moldura em branco sobre preto
  assert.ok((pdf.match(/ re/g) ?? []).length > 200);      // quadrados do QR
  assert.doesNotMatch(pdf, /\[QR\]/);
  assert.match(pdf, /startxref\n\d+\n%%EOF\n$/);
});

test('xref offsets point at each object', () => {
  const pdf = ticketPdf(ticketParts(formatTicket(ticket))[1], { qr: fakeQr }).toString('latin1');
  const offsets = pdf.split('xref\n')[1].split('\n').slice(2, 8).map(l => Number(l.slice(0, 10)));
  offsets.forEach((o, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj`, o), `obj ${i + 1}`));
});
