import { writeFile, rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { IfoodClient } from './client';
import { IfoodEvent, IfoodOrder } from './types';
import { loadConfig } from './config';
import { checkIfoodStore, hasStoredIfoodOrder, storeIfoodEvent } from './order-store';
import { resolveMerchant } from './merchants';

const ACCESS_RECHECK_MS = 5 * 60_000;

/** Separa as lojas configuradas entre liberadas (ORDER+EVENTS) e pendentes. */
export function splitByAccess<T extends { id: string }>(merchants: T[], access: { id: string; authorized: boolean }[]) {
  const ok = (m: T) => access.some(a => a.id === m.id && a.authorized);
  return { active: merchants.filter(ok), pending: merchants.filter(m => !ok(m)) };
}

export type OrderHandler = (event: IfoodEvent, order: IfoodOrder | null, client: IfoodClient) => Promise<void>;

// Monitorar não confirma o pedido comercialmente. A confirmação automática é opt-in.
export const defaultHandler: OrderHandler = async (event, order, client) => {
  const merchant = resolveMerchant(client.config.merchants, event.merchantId, order?.merchant?.id);
  if (!client.config.dryRun) await storeIfoodEvent(event, order, merchant.brand, client.config.dryRun);
  console.log(`[${merchant.name}] pedido ${order?.displayId ?? event.orderId}: ${event.code}`);
  if (event.code === 'PLC' && client.config.autoConfirm && !client.config.dryRun) {
    await client.confirm(event.orderId);
    // 202 é assíncrono: somente o evento CFM confirma o status no banco.
    console.log(`[${merchant.name}] confirmação solicitada; aguardando CFM`);
  }
};

/** Reutilizado pelo polling e pelo worker da fila de webhook. Não envia ACK. */
export async function processEvent(client: IfoodClient, event: IfoodEvent, handler: OrderHandler = defaultHandler, hasOrder = hasStoredIfoodOrder) {
  if (!event.id || !event.orderId || !event.code) throw new Error('Evento iFood incompleto');
  // Não buscar nem consumir pedidos de outras lojas em caso de filtro ignorado.
  if (event.merchantId) resolveMerchant(client.config.merchants, event.merchantId);
  const needsOrder = ['PLC', 'CFM', 'PRS', 'RTP', 'DSP', 'CON', 'CAN'].includes(event.code);
  const knownMerchant = event.merchantId ? resolveMerchant(client.config.merchants, event.merchantId) : undefined;
  const stored = needsOrder && !client.config.dryRun && knownMerchant ? await hasOrder(event.orderId, knownMerchant.brand) : false;
  const fetchOrder = (needsOrder && !stored) || !event.merchantId || (event.code === 'PLC' && client.config.autoConfirm);
  const order = fetchOrder ? await client.getOrder(event.orderId) : null;
  if (fetchOrder && !order) throw new Error('Detalhes do pedido indisponíveis');
  if (order && order.id !== event.orderId) throw new Error('ID do pedido diverge do evento');
  resolveMerchant(client.config.merchants, event.merchantId, order?.merchant?.id);
  await handler(event, order, client);
}

/** Um evento com erro não impede as demais lojas; ACK só após persistir. */
export async function pollCycle(client: IfoodClient, handler: OrderHandler = defaultHandler, hasOrder = hasStoredIfoodOrder, merchantIds?: string[]) {
  const events = await client.pollEvents(merchantIds ? { merchantIds } : {});
  const processed: string[] = [];
  let failed = 0;
  for (const event of events) {
    try {
      await processEvent(client, event, handler, hasOrder);
      processed.push(event.id);
    } catch (err) {
      failed++;
      console.error(`Evento ${event.id}: ${err instanceof Error ? err.message : 'falha no processamento'}`);
    }
  }
  if (!client.config.dryRun) await client.acknowledgeEvents([...new Set(processed)]);
  return { received: events.length, processed: processed.length, failed };
}

export async function runPoller(handler: OrderHandler = defaultHandler) {
  const config = loadConfig();
  if (!config.dryRun && !process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL antes de ativar o conector');
  const client = new IfoodClient(config);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const healthPath = process.env.IFOOD_HEALTH_FILE || '/tmp/ifood-health.json';
  // Cada loja é liberada de forma independente no iFood: lojas já autorizadas
  // são monitoradas enquanto as pendentes são reverificadas periodicamente.
  let active: string[] = [];
  let pending: typeof config.merchants = config.merchants;
  let lastAccessCheck = 0;
  const writeHealth = async (state: Record<string, unknown>) => {
    await writeFile(`${healthPath}.tmp`, JSON.stringify({ dryRun: config.dryRun, merchants: config.merchants, ...state }));
    await rename(`${healthPath}.tmp`, healthPath);
  };
  try {
    while (!controller.signal.aborted) {
      const startedAt = Date.now();
      let waiting = false;
      try {
        if (!config.dryRun) await checkIfoodStore();
        if (pending.length && Date.now() - lastAccessCheck >= ACCESS_RECHECK_MS) {
          const access = await client.getMerchantAccess(true);
          lastAccessCheck = Date.now();
          const split = splitByAccess(config.merchants, access);
          if (split.active.length !== active.length) {
            console.log(`Monitoramento iFood: ${split.active.map(m => m.name).join(', ') || 'nenhuma loja'}; simulação: ${config.dryRun}; confirmação automática: ${config.autoConfirm}`);
          }
          active = split.active.map(m => m.id);
          pending = split.pending;
          if (pending.length) console.log(`Aguardando ativação ORDER/EVENTS no iFood: ${pending.map(m => m.name).join(', ')}`);
        }
        if (!active.length) {
          waiting = true;
          await writeHealth({ state: 'waiting_authorization', lastCheck: Date.now(), pending });
        } else {
          const result = await pollCycle(client, handler, hasStoredIfoodOrder, active);
          if (result.failed) throw new Error(`${result.failed} evento(s) pendente(s) de nova tentativa`);
          await writeHealth({ state: 'monitoring', lastSuccess: Date.now(), active, pending, ...result });
        }
      } catch (err) {
        // Força nova leitura das permissões: uma revogação também é detectada.
        lastAccessCheck = 0;
        pending = config.merchants;
        active = [];
        console.error('Falha no monitoramento iFood:', err instanceof Error ? err.message : 'erro desconhecido');
      }
      await delay(Math.max(30_000, (waiting ? 60_000 : config.pollIntervalMs) - (Date.now() - startedAt)), undefined, { signal: controller.signal }).catch(err => {
        if (err.name !== 'AbortError') throw err;
      });
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (require.main === module) {
  runPoller().then(() => process.exit(0)).catch(err => {
    console.error(err instanceof Error ? err.message : 'Falha ao iniciar iFood');
    process.exit(1);
  });
}
