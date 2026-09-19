import { formatTicket } from './ticket.mjs';
import { TransportError } from './transports.mjs';

const UNCERTAIN_RESTART = 'Agente reiniciou durante envio; conferir papel e spool antes de reimprimir';

export class ApiError extends Error {
  constructor(status) {
    super(`API de impressao respondeu HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function createApi({ apiUrl, token, timeoutMs = 10000 }, fetchImpl = fetch) {
  const post = async (path, body) => {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error', // Nao repassar o token para outro destino.
    });
    if (!response.ok) throw new ApiError(response.status);
    if (response.status === 204) return null;
    return response.json();
  };
  return {
    status: () => post('/api/print-agent/status', {}),
    claim: () => post('/api/print-agent/jobs/claim', {}),
    complete: entry => post(`/api/print-agent/jobs/${encodeURIComponent(entry.id)}/complete`, { leaseToken: entry.leaseToken }),
    fail: entry => post(`/api/print-agent/jobs/${encodeURIComponent(entry.id)}/fail`, {
      leaseToken: entry.leaseToken, error: entry.error, uncertain: entry.uncertain,
    }),
  };
}

export class PrintAgent {
  constructor({ api, journal, print, columns = 48, timeZone = 'America/Sao_Paulo', log = console.log }) {
    Object.assign(this, { api, journal, print, columns, timeZone, log });
  }
  async settle(entry) {
    if (entry.state === 'intent') {
      entry = { ...entry, state: 'fail_pending', uncertain: true, error: UNCERTAIN_RESTART };
      await this.journal.put(entry);
    }
    try {
      if (entry.state === 'submitted') {
        await this.api.complete(entry);
        await this.journal.put({ ...entry, state: 'complete' });
        this.log(`Pedido ${entry.orderNumber}: envio confirmado ao servidor; verificar impressora se nao saiu papel.`);
      } else if (entry.state === 'fail_pending') {
        await this.api.fail(entry);
        await this.journal.put({ ...entry, state: 'failed' });
        this.log(`Pedido ${entry.orderNumber}: ${entry.uncertain ? 'envio incerto, revisao manual necessaria' : 'falha antes do envio; fila pode tentar novamente'}.`);
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      // Retry manual invalida o lease anterior. Arquivar a tentativa antiga sem
      // IO; ela nao pode bloquear outras comandas nem confirmar o lease novo.
      await this.journal.put({ ...entry, state: 'superseded' });
      this.log(`Pedido ${entry.orderNumber}: reserva substituida no servidor; tentativa antiga arquivada sem novo envio. Conferir reimpressao com a equipe.`);
    }
  }

  async runOnce() {
    // Sem ACK, retomar somente a confirmacao. Nao imprimir de novo.
    for (const entry of await this.journal.pending()) await this.settle(entry);
    const result = await this.api.claim();
    if (!result?.job) return false;
    const job = result.job;
    if (typeof job.leaseToken !== 'string' || !job.leaseToken || !job.ticket) throw new Error('Reserva de impressao invalida');
    const previous = await this.journal.read(job.id);
    if (previous?.leaseToken === job.leaseToken) {
      if (previous.state === 'complete') await this.api.complete(previous);
      else if (previous.state === 'failed') await this.api.fail(previous);
      else await this.settle(previous);
      return true;
    }
    const entry = {
      id: job.id, leaseToken: job.leaseToken, orderNumber: job.ticket.orderNumber,
      state: 'intent',
    };
    let text;
    try { text = formatTicket(job.ticket, { columns: this.columns, timeZone: this.timeZone }); }
    catch {
      await this.journal.put({ ...entry, state: 'fail_pending', error: 'Ticket invalido para impressao', uncertain: false });
      await this.settle(await this.journal.read(job.id));
      return true;
    }
    // Claim antigo ou com lease curto nunca pode comecar IO. Limite protege
    // contra resposta HTTP atrasada e garante tempo para transporte + ACK.
    if (!Number.isFinite(Date.parse(job.leaseExpiresAt)) || Date.parse(job.leaseExpiresAt) - Date.now() < 65000) {
      await this.journal.put({ ...entry, state: 'fail_pending', error: 'Reserva sem tempo suficiente para enviar com seguranca', uncertain: false });
      await this.settle(await this.journal.read(job.id));
      return true;
    }
    await this.journal.put(entry);
    let receipt;
    try { receipt = await this.print(text, job.ticket); }
    catch (error) {
      await this.journal.put({
        ...entry, state: 'fail_pending',
        error: error instanceof TransportError ? error.message : 'Falha inesperada durante envio; conferir impressora',
        uncertain: error instanceof TransportError ? error.uncertain : true,
      });
      await this.settle(await this.journal.read(job.id));
      return true;
    }
    // Se a gravacao falhar apos enviar, intent continua duravel e a recuperacao
    // pede revisao manual. Nunca inferir que e seguro repetir papel.
    await this.journal.put({ ...entry, state: 'submitted', receipt });
    await this.settle(await this.journal.read(job.id));
    return true;
  }
}
