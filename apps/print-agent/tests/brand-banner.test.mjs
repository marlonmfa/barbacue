import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTicket, escposBytes, BANNER_LINES } from '../src/ticket.mjs';

const ticket = brand => ({ version: 2, brand, orderNumber: 'AB12CD34', channel: 'anotaai', orderType: 'delivery',
  customerName: 'Ana', items: [{ name: 'Item', qty: 1 }], createdAt: '2026-11-10T13:00:00Z',
  subtotalCents: 1000, totalCents: 1000, payment: { status: 'paid', method: 'pix' } });

test('each restaurant gets its own frame, name and footer on the shared printer', () => {
  const frames = {};
  for (const [brand, fill, name] of [['barbacue', '#', 'BARBACUE'], ['chelas', '*', 'CHELAS'], ['barbadog', '=', 'BARBADOG']]) {
    for (const columns of [32, 48]) {
      const lines = formatTicket(ticket(brand), { columns }).split('\n');
      const banner = lines.slice(0, BANNER_LINES);
      assert.equal(banner[0], fill.repeat(columns));
      assert.equal(banner[4], fill.repeat(columns));
      assert.ok(banner.every(l => l.length === columns), `${brand}/${columns}: banner width`);
      assert.match(banner[1], new RegExp(` ${name} `));
      assert.ok(lines.includes(`FIM - ${name} #AB12CD34`), `${brand}: footer`);
      frames[brand] = fill;
    }
  }
  assert.equal(new Set(Object.values(frames)).size, 3);
});

test('ESC/POS prints the frame in bold and stays ASCII-only', () => {
  const bytes = escposBytes(formatTicket(ticket('chelas')));
  const boldOn = bytes.indexOf(Buffer.from([0x1b, 0x45, 0x01]));
  const boldOff = bytes.indexOf(Buffer.from([0x1b, 0x45, 0x00]));
  assert.ok(boldOn > 0 && boldOff > boldOn);
  assert.match(bytes.subarray(boldOn, boldOff).toString('ascii'), /CHELAS/);
});
