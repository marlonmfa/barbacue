import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

const STATES = new Set(['intent', 'submitted', 'fail_pending', 'complete', 'failed', 'superseded']);
export class Journal {
  constructor(directory) { this.directory = directory; }
  async init() {
    await mkdir(join(this.directory, 'archive'), { recursive: true, mode: 0o700 });
  }
  path(id, archived = false) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Identificador de job invalido');
    return join(this.directory, ...(archived ? ['archive'] : []), `${id}.json`);
  }
  async read(id) {
    try {
      let raw;
      try { raw = await readFile(this.path(id), 'utf8'); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        raw = await readFile(this.path(id, true), 'utf8');
      }
      const entry = JSON.parse(raw);
      if (entry.id !== id || !STATES.has(entry.state) || typeof entry.leaseToken !== 'string' || !entry.leaseToken) {
        throw new Error('Journal invalido; recuperar estado antes de reiniciar');
      }
      return entry;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error; // Corrupcao nunca deve liberar uma nova impressao.
    }
  }
  async put(entry) {
    const terminal = ['complete', 'failed', 'superseded'].includes(entry.state);
    const destination = this.path(entry.id, terminal);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify({ ...entry, updatedAt: new Date().toISOString() }));
      await handle.sync();
    } finally { await handle.close(); }
    try {
      await rename(temporary, destination);
      // Persistir tambem o rename antes de qualquer IO irreversivel.
      // Windows nao permite fsync de diretorio; o arquivo permanece sincronizado.
      if (process.platform !== 'win32') {
        const dir = await open(terminal ? join(this.directory, 'archive') : this.directory, 'r');
        try { await dir.sync(); } finally { await dir.close(); }
      }
      if (terminal) {
        // Manter historico para deduplicar sem reler todos os pedidos por poll.
        await unlink(this.path(entry.id)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        if (process.platform !== 'win32') {
          const dir = await open(this.directory, 'r');
          try { await dir.sync(); } finally { await dir.close(); }
        }
      }
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  async pending() {
    const entries = [];
    for (const name of (await readdir(this.directory)).sort()) {
      if (!name.endsWith('.json')) continue;
      const entry = await this.read(name.slice(0, -5));
      if (entry && !['complete', 'failed', 'superseded'].includes(entry.state)) entries.push(entry);
    }
    return entries;
  }
}

// O SO libera a porta em crashes/reboots. Evita locks de arquivo obsoletos e
// corridas ao remover lock de PID morto. O servidor nao aceita comandos.
export async function acquireSingleton(port = 9178) {
  const server = net.createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') reject(new Error('Outro print-agent esta ativo (porta de lock ocupada)'));
      else reject(error);
    });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  return () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
