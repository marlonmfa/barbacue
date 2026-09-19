import net from 'node:net';
import { spawn } from 'node:child_process';
import { escposBytes } from './ticket.mjs';

export class TransportError extends Error {
  constructor(message, uncertain = false) {
    super(message); this.name = 'TransportError'; this.uncertain = uncertain;
  }
}

export function sendTcp(payload, { host, port = 9100, timeoutMs = 10000 }, createConnection = net.createConnection) {
  return new Promise((resolve, reject) => {
    let writing = false;
    let settled = false;
    let socket;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      if (error) reject(error);
      else resolve({ transport: 'tcp', reference: 'bytes-submitted' });
    };
    const timer = setTimeout(() => finish(new TransportError('Tempo limite ao enviar para a impressora TCP', writing)), timeoutMs);
    try {
      socket = createConnection({ host, port });
      socket.once('error', () => finish(new TransportError('Falha de conexao com a impressora TCP', writing)));
      socket.once('close', () => {
        if (!settled) finish(new TransportError('Conexao TCP encerrada antes de concluir o envio', writing));
      });
      socket.once('connect', () => {
        writing = true;
        // Callback significa entrega ao sistema operacional, nao papel impresso.
        socket.end(payload, () => finish());
      });
    } catch {
      finish(new TransportError('Nao foi possivel iniciar a conexao TCP', writing));
    }
  });
}

export function sendCups(payload, { printer, format = 'text', timeoutMs = 10000, orderNumber }, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    let started = false;
    let settled = false;
    let child;
    let output = '';
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child?.kill('SIGKILL');
        reject(error);
      } else resolve({ transport: 'cups', reference: output.trim().slice(0, 300) || 'spool-accepted' });
    };
    const timer = setTimeout(() => finish(new TransportError('Tempo limite ao enviar para a fila CUPS; conferir o spool', started)), timeoutMs);
    const args = ['-d', printer, '-t', `COZINHA ${orderNumber}`, '-o', format === 'escpos' ? 'raw' : 'document-format=text/plain', '-'];
    try {
      // Argumentos separados e shell desativado: nomes nao executam comandos.
      child = spawnProcess('lp', args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      child.once('spawn', () => { started = true; });
      child.once('error', () => finish(new TransportError('Nao foi possivel executar lp; verificar CUPS e a fila instalada', started)));
      child.stdin.once('error', () => finish(new TransportError('Falha ao transmitir a comanda para lp; conferir o spool', started)));
      child.stdout.on('data', chunk => { if (output.length < 4096) output += chunk.toString('utf8').slice(0, 4096 - output.length); });
      child.stderr.on('data', () => {}); // Drenar, sem expor dados do ambiente ao servidor.
      child.once('close', code => {
        if (code === 0) finish();
        else finish(new TransportError('lp nao confirmou a submissao; conferir a fila CUPS antes de reimprimir', started));
      });
      child.stdin.end(payload);
    } catch {
      finish(new TransportError('Nao foi possivel iniciar lp', started));
    }
  });
}

export function createTransport(config) {
  if (config.transport === 'dry-run') throw new Error('Dry-run nao consome a fila; use o comando preview com ticket local');
  return async (text, ticket) => {
    if (config.transport === 'tcp') {
      return sendTcp(escposBytes(text, config), { host: config.tcpHost, port: config.tcpPort, timeoutMs: config.timeoutMs });
    }
    return sendCups(config.cupsFormat === 'escpos' ? escposBytes(text, config) : Buffer.from(text, 'ascii'), {
      printer: config.cupsPrinter, format: config.cupsFormat, timeoutMs: config.timeoutMs, orderNumber: ticket.orderNumber,
    });
  };
}
