import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Journal, acquireSingleton } from '../src/journal.mjs';
import { PrintAgent, createApi, ApiError } from '../src/agent.mjs';
import { TransportError, sendTcp, sendCups, createTransport } from '../src/transports.mjs';
import { formatTicket, escposBytes } from '../src/ticket.mjs';
import { readConfig } from '../src/config.mjs';

const fixture = JSON.parse(await readFile(new URL('../examples/ticket.json', import.meta.url), 'utf8'));
const ticket = () => structuredClone(fixture);
const job = () => ({ id: 'job-1', leaseToken: 'lease-1', leaseExpiresAt: new Date(Date.now() + 120000).toISOString(), ticket: ticket() });

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'barbacue-print-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const journal = new Journal(directory);
  await journal.init();
  const queue = [job()];
  const completed = [], failed = [], prints = [];
  const api = { claim: async () => ({ job: queue.shift() || null }), complete: async e => completed.push(e), fail: async e => failed.push(e) };
  const agent = new PrintAgent({ journal, api, print: async text => { prints.push(text); return { transport: 'fake' }; }, log: () => {} });
  return { directory, journal, queue, completed, failed, prints, api, agent };
}

test('comanda preserva preparo, marca, mesa, pagamento e quebra em 32/48 colunas', () => {
  const sample = ticket();
  sample.items[0].notes = 'Sem cebola, porção à parte. ' + 'muitolongo'.repeat(10);
  sample.customerName = 'DADO PRIVADO';
  sample.address = 'ENDERECO PRIVADO';
  for (const columns of [32, 48]) {
    const text = formatTicket(sample, { columns });
    assert.match(text, /MESA 12/);
    assert.match(text, /BARBACUE/);
    assert.match(text, /PEDIDO #DEMO0001/);
    assert.match(text, /PAGAMENTO PENDENTE/);
    assert.match(text.replace(/\s+/g, ' '), /porcao a parte/);
    assert.doesNotMatch(text, /PRIVADO/);
    assert.ok(text.split('\n').every(line => line.length <= columns));
  }
});

test('cliente nao injeta controles e corte ESC/POS e opcional', () => {
  const sample = ticket();
  sample.notes = 'Normal\x1b@\x1dV\x00\n\x07 Pão 🍔';
  const text = formatTicket(sample);
  assert.doesNotMatch(text, /[\x00-\x09\x0b-\x1f]/);
  const bytes = escposBytes(text);
  assert.equal(bytes.filter(byte => byte === 0x1b).length, 1);
  assert.equal(bytes.filter(byte => byte === 0x1d).length, 0);
  assert.deepEqual([...escposBytes(text, { cut: true }).subarray(-3)], [0x1d, 0x56, 0]);
  assert.throws(() => escposBytes('unsafe\x1b@'));
  sample.orderType = 'pickup'; sample.channel = 'kiosk'; sample.reprint = true;
  assert.match(formatTicket(sample), /BALCAO \/ RETIRADA/);
  assert.match(formatTicket(sample), /REIMPRESSAO/);
});

test('journal intent existe antes do envio e submitted antes do ACK', async t => {
  const x = await setup(t);
  x.agent.print = async () => {
    assert.equal((await x.journal.read('job-1')).state, 'intent');
    return { transport: 'fake' };
  };
  x.api.complete = async () => assert.equal((await x.journal.read('job-1')).state, 'submitted');
  await x.agent.runOnce();
  assert.equal((await x.journal.read('job-1')).state, 'complete');
});

test('resposta de ACK perdida repete apenas confirmacao, nunca papel', async t => {
  const x = await setup(t);
  let calls = 0;
  x.api.complete = async () => { if (++calls === 1) throw new Error('Offline apos submissao'); };
  await assert.rejects(x.agent.runOnce(), /Offline/);
  assert.equal((await x.journal.read('job-1')).state, 'submitted');
  await x.agent.runOnce();
  assert.equal(x.prints.length, 1);
  assert.equal(calls, 2);
  assert.equal((await x.journal.read('job-1')).state, 'complete');
});

test('reinicio durante envio sinaliza incerto e nao reimprime', async t => {
  const x = await setup(t);
  x.queue.length = 0;
  await x.journal.put({ id: 'job-1', leaseToken: 'lease-1', orderNumber: fixture.orderNumber, state: 'intent' });
  await x.agent.runOnce();
  assert.equal(x.prints.length, 0);
  assert.equal(x.failed.length, 1);
  assert.equal(x.failed[0].uncertain, true);
  assert.equal((await x.journal.read('job-1')).state, 'failed');
});

test('falha certa pode reprocessar novo lease; ACK de fail perdido nao imprime', async t => {
  const x = await setup(t);
  x.agent.print = async () => { throw new TransportError('Conexao recusada', false); };
  let failures = 0;
  x.api.fail = async () => { if (++failures === 1) throw new Error('ACK perdido'); };
  await assert.rejects(x.agent.runOnce(), /ACK perdido/);
  await x.agent.runOnce();
  assert.equal(failures, 2);
  assert.equal((await x.journal.read('job-1')).uncertain, false);
  x.queue.push({ ...job(), leaseToken: 'lease-2' });
  x.agent.print = async text => { x.prints.push(text); return { transport: 'fake' }; };
  await x.agent.runOnce();
  assert.equal(x.prints.length, 1);
});

test('erro desconhecido depois de iniciar IO sempre exige revisao', async t => {
  const x = await setup(t);
  x.agent.print = async () => { throw new Error('Falha inesperada'); };
  await x.agent.runOnce();
  assert.equal(x.failed[0].uncertain, true);
});

test('falha de persistencia depois do envio deixa intent para revisao', async t => {
  const x = await setup(t);
  const original = x.journal.put.bind(x.journal);
  x.journal.put = async entry => { if (entry.state === 'submitted') throw new Error('Disco cheio'); return original(entry); };
  await assert.rejects(x.agent.runOnce(), /Disco cheio/);
  assert.equal(x.prints.length, 1);
  assert.equal((await x.journal.read('job-1')).state, 'intent');
  x.journal.put = original;
  await x.agent.runOnce();
  assert.equal(x.prints.length, 1);
  assert.equal(x.failed[0].uncertain, true);
});

test('journal corrompido bloqueia consumo e identificador nao sai da pasta', async t => {
  const x = await setup(t);
  await writeFile(join(x.directory, 'job-1.json'), '{bad');
  await assert.rejects(x.agent.runOnce());
  assert.equal(x.queue.length, 1);
  assert.throws(() => x.journal.path('../escape'));
});

test('reserva perto de expirar e ticket invalido nao enviam papel', async t => {
  const x = await setup(t);
  x.queue[0].leaseExpiresAt = new Date(Date.now() + 2000).toISOString();
  await x.agent.runOnce();
  assert.equal(x.prints.length, 0);
  assert.equal(x.failed[0].uncertain, false);
  x.queue.push({ ...job(), id: 'job-2', ticket: { ...ticket(), version: 99 } });
  await x.agent.runOnce();
  assert.equal(x.prints.length, 0);
});

test('TCP envia bytes a receptor local de teste e finaliza', async t => {
  let payload = Buffer.alloc(0);
  const server = net.createServer(socket => socket.on('data', data => { payload = Buffer.concat([payload, data]); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const receipt = await sendTcp(Buffer.from('COMANDA TESTE'), { host: '127.0.0.1', port: server.address().port, timeoutMs: 500 });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(payload.toString(), 'COMANDA TESTE');
  assert.equal(receipt.transport, 'tcp');
});

test('timeout TCP distingue conexao nao iniciada de bytes possivelmente enviados', async () => {
  for (const connect of [false, true]) {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.end = () => {};
    const result = sendTcp(Buffer.from('TESTE'), { host: 'fake', timeoutMs: 10 }, () => socket);
    if (connect) socket.emit('connect');
    await assert.rejects(result, error => error instanceof TransportError && error.uncertain === connect);
  }
});

function fakeProcess() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.killed = true; };
  return child;
}

test('CUPS usa argumentos sem shell, confirma spool e limita tempo', async () => {
  const child = fakeProcess();
  let captured;
  const promise = sendCups(Buffer.from('TESTE'), { printer: 'Cozinha', orderNumber: 'DEMO0001', timeoutMs: 100 }, (cmd, args, opts) => {
    captured = { cmd, args, opts }; return child;
  });
  child.emit('spawn');
  child.stdout.emit('data', Buffer.from('request id is Cozinha-42\n'));
  child.emit('close', 0);
  assert.equal((await promise).reference, 'request id is Cozinha-42');
  assert.equal(captured.cmd, 'lp');
  assert.equal(captured.opts.shell, false);
  assert.ok(captured.args.includes('document-format=text/plain'));
  const hung = fakeProcess();
  const timed = sendCups(Buffer.from('TESTE'), { printer: 'Cozinha', timeoutMs: 10 }, () => hung);
  hung.emit('spawn');
  await assert.rejects(timed, error => error.uncertain === true);
  assert.equal(hung.killed, true);
});

test('lp ausente e falha certa; saida nao zero apos spawn e incerta', async () => {
  for (const started of [false, true]) {
    const child = fakeProcess();
    const promise = sendCups(Buffer.from('TESTE'), { printer: 'Cozinha', timeoutMs: 100 }, () => child);
    if (started) { child.emit('spawn'); child.emit('close', 1); }
    else child.emit('error', new Error('ENOENT'));
    await assert.rejects(promise, error => error.uncertain === started);
  }
});

test('lock impede duas instancias e e liberado ao encerrar', async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const release = await acquireSingleton(port);
  try { await assert.rejects(acquireSingleton(port), /Outro print-agent/); }
  finally { await release(); }
  const releaseAgain = await acquireSingleton(port);
  await releaseAgain();
});

test('config exige segredo, origem HTTPS e dry-run nao cria transporte', () => {
  assert.equal(readConfig({}).transport, 'dry-run');
  assert.throws(() => createTransport(readConfig({})), /Dry-run/);
  const base = { PRINT_TRANSPORT: 'tcp', PRINT_AGENT_TOKEN: 'a'.repeat(32), PRINT_TCP_HOST: '192.168.1.50' };
  assert.equal(readConfig(base).tcpPort, 9100);
  assert.throws(() => readConfig({ ...base, PRINT_AGENT_TOKEN: 'curto' }), /32/);
  assert.throws(() => readConfig({ ...base, PRINT_API_URL: 'http://example.com' }), /HTTPS/);
  assert.throws(() => readConfig({ ...base, PRINT_API_URL: 'https://example.com/path' }), /origem/);
  assert.throws(() => readConfig({ ...base, PRINT_TIMEOUT_MS: '120000' }), /30000/);
});

test('API usa bearer, timeout, caminho correto e nao segue redirects', async () => {
  const calls = [];
  const api = createApi({ apiUrl: 'https://loja.example', token: 'segredo' }, async (url, options) => {
    calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ job: null }) };
  });
  assert.equal((await api.claim()).job, null);
  await api.complete({ id: 'job-1', leaseToken: 'lease-1' });
  await api.fail({ id: 'job-1', leaseToken: 'lease-1', error: 'Incerto', uncertain: true });
  assert.equal(calls[0].options.headers.authorization, 'Bearer segredo');
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.match(calls[1].url, /jobs\/job-1\/complete$/);
  assert.equal(JSON.parse(calls[2].options.body).uncertain, true);
});


test('ACK antigo com HTTP 409 e arquivado e nao bloqueia lease de retry manual', async t => {
  for (const state of ['submitted', 'fail_pending']) {
    const x = await setup(t);
    x.queue.length = 0;
    await x.journal.put({ id: 'job-1', leaseToken: 'lease-1', orderNumber: fixture.orderNumber, state, uncertain: true, error: 'Envio incerto' });
    x.api.complete = async () => { throw new ApiError(409); };
    x.api.fail = async () => { throw new ApiError(409); };
    await x.agent.runOnce();
    assert.equal(x.prints.length, 0);
    assert.equal((await x.journal.read('job-1')).state, 'superseded');
    assert.deepEqual(await x.journal.pending(), []);
    x.queue.push({ ...job(), leaseToken: 'lease-manual-novo' });
    x.api.complete = async entry => x.completed.push(entry);
    await x.agent.runOnce();
    assert.equal(x.prints.length, 1);
    assert.equal(x.completed[0].leaseToken, 'lease-manual-novo');
  }
});
