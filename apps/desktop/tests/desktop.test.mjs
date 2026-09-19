import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrigin, validateSettings, allowedNavigation, publicSettings } from '../src/settings.mjs';
import { ticketHtml, printTicket } from '../src/printing.mjs';
import { TransportError } from '../../print-agent/src/transports.mjs';
const config = { serverUrl: 'https://loja.example', token: 'a'.repeat(64), printer: 'EPSON TM-T20 USB', paper: 80, autoPrint: true, startAtLogin: true };
test('origin validation prevents credentials, insecure remote and paths', () => {
  assert.equal(normalizeOrigin('https://loja.example/'), 'https://loja.example');
  assert.equal(normalizeOrigin('http://127.0.0.1:3099'), 'http://127.0.0.1:3099');
  for (const url of ['http://remote.example', 'file:///etc/passwd', 'https://u:password@loja.example', 'https://loja.example/admin', 'https://loja.example?token=secret']) assert.throws(() => normalizeOrigin(url));
});
test('secret retained only for unchanged server; never exposed to renderer', () => {
  assert.equal(validateSettings({ ...config, token: '' }, config).token, config.token);
  assert.throws(() => validateSettings({ ...config, token: '', serverUrl: 'https://other.example' }, config));
  assert.equal(publicSettings(config).token, undefined);
  assert.equal(publicSettings(config).hasToken, true);
  assert.throws(() => validateSettings({ ...config, printer: '' }));
  assert.throws(() => validateSettings({ ...config, paper: 33 }));
});
test('remote navigation is confined to configured origin', () => {
  assert.ok(allowedNavigation('https://loja.example/admin/orders', config.serverUrl));
  for (const url of ['https://loja.example.attacker.test/', 'javascript:alert(1)', 'file:///secret', 'https://attacker.test', 'https://user@loja.example']) assert.equal(allowedNavigation(url, config.serverUrl), false);
});
test('print HTML escapes customer content and prohibits scripts', () => {
  const html = ticketHtml('<script>alert(1)</script> & "test"', 58);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!html.includes('<script>'));
  assert.throws(() => ticketHtml('x', 1));
});
function printer(mode) {
  const calls = [];
  class Window {
    destroyed = false;
    constructor(options) { calls.push(options); }
    webContents = {
      getPrintersAsync: async () => mode === 'missing' ? [] : [{ name: config.printer }],
      print: (options, callback) => { calls.push(options); if (mode !== 'timeout') callback(mode === 'ok'); },
    };
    async loadURL(url) { calls.push(url); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; calls.push('destroyed'); }
  }
  return { Window, calls };
}
for (const mode of ['missing', 'fail', 'timeout', 'ok']) test(`spool ${mode}: failures have correct certainty and release window`, async () => {
  const { Window, calls } = printer(mode);
  const result = printTicket({ BrowserWindow: Window, TransportError, text: 'TESTE\n', settings: config, timeoutMs: 15 });
  if (mode === 'ok') assert.equal((await result).reference, 'spool-accepted');
  else await assert.rejects(result, error => error instanceof TransportError && error.uncertain === (mode !== 'missing'));
  assert.equal(calls.at(-1), 'destroyed');
  if (mode !== 'missing') {
    const options = calls.find(c => c?.deviceName);
    assert.equal(options.deviceName, config.printer);
    assert.equal(options.silent, true);
    assert.equal(options.copies, 1);
  }
});
