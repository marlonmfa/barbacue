import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { writeFile, rename } from 'node:fs/promises';
import { loadConfig, IfoodConfig } from './config';
import { IfoodClient } from './client';
import { resolveMerchant } from './merchants';
import { processEvent } from './poller';
import { storeIfoodEvent } from './order-store';
import { IfoodEvent } from './types';

type Enqueue = (events: IfoodEvent[]) => Promise<void>;
const MAX_BODY = 1_048_576;

/** Valida os bytes originais antes de interpretar ou persistir qualquer evento. */
export async function receiveWebhook(raw: Buffer, header: string | undefined, config: IfoodConfig, enqueue: Enqueue): Promise<number> {
  if (raw.length > MAX_BODY) return 413;
  const signature = (header || '').replace(/^sha256=/, '');
  if (!config.clientSecret || !/^[a-f\d]{64}$/i.test(signature)) return 401;
  const expected = createHmac('sha256', config.clientSecret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return 401;
  let events: IfoodEvent[];
  try {
    const body = JSON.parse(raw.toString('utf8'));
    events = Array.isArray(body) ? body : [body];
    if (!events.length || events.length > 2000) return 400;
    for (const event of events) {
      if (!event || typeof event !== 'object' || typeof event.code !== 'string' || typeof event.id !== 'string' || !event.id || event.id.length > 200) return 400;
      if (event.code === 'KEEPALIVE' || event.fullCode === 'KEEPALIVE') continue;
      if (typeof event.orderId !== 'string' || !/^[\da-f-]{36}$/i.test(event.orderId) || typeof event.merchantId !== 'string') return 400;
      resolveMerchant(config.merchants, event.merchantId);
    }
  } catch { return 400; }
  if (config.dryRun) return 503; // nunca confirma um evento que não será persistido
  const business = events.filter(e => e.code !== 'KEEPALIVE' && e.fullCode !== 'KEEPALIVE');
  try { if (business.length) await enqueue(business); }
  catch { return 503; }
  return 202; // somente depois do COMMIT; processamento não bloqueia a resposta ao iFood
}

export async function enqueueEvents(pool: Pool, events: IfoodEvent[]) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout = '2000ms'");
    // Inserção única: lote atômico e deduplicação pelo ID oficial do evento.
    await db.query(`INSERT INTO ifood_webhook_inbox (event_id, merchant_id, payload)
      SELECT e->>'id', (e->>'merchantId')::uuid, e FROM jsonb_array_elements($1::jsonb) e
      ON CONFLICT (event_id) DO NOTHING`, [JSON.stringify(events)]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

export async function runWebhook() {
  const config = loadConfig();
  if (config.dryRun || !process.env.DATABASE_URL) throw new Error('Webhook exige banco configurado e IFOOD_DRY_RUN=false');
  const port = Number(process.env.IFOOD_WEBHOOK_PORT || 3467);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('IFOOD_WEBHOOK_PORT inválida');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 1500, query_timeout: 2500, application_name: 'barbacue-ifood-webhook' });
  await pool.query('SELECT event_id, payload, next_attempt_at FROM ifood_webhook_inbox LIMIT 0');
  const client = new IfoodClient(config);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  let lastReceipt: number | null = null;
  const server = createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      try { await pool.query('SELECT 1'); res.writeHead(200).end(JSON.stringify({ ok: true, merchants: config.merchants.map(m => ({ id: m.id, name: m.name })), lastReceipt })); }
      catch { res.writeHead(503).end(); }
      return;
    }
    if (req.url !== '/api/ifood/webhook') { res.writeHead(404).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) { res.writeHead(413).end(); return; }
        chunks.push(Buffer.from(chunk));
      }
      const signature = req.headers['x-ifood-signature'];
      const status = await receiveWebhook(Buffer.concat(chunks), typeof signature === 'string' ? signature : undefined, config, events => enqueueEvents(pool, events));
      if (status === 202) lastReceipt = Date.now();
      res.writeHead(status).end();
    } catch { if (!res.headersSent) res.writeHead(503); res.end(); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const healthFile = process.env.IFOOD_WEBHOOK_HEALTH_FILE || '/tmp/ifood-webhook-health.json';
  try {
    while (!controller.signal.aborted) {
      try {
        // Uma única instância worker. Polling concorrente usa os mesmos IDs e transições monotônicas.
        const pending = await pool.query('SELECT event_id, payload FROM ifood_webhook_inbox WHERE processed_at IS NULL AND next_attempt_at <= now() ORDER BY received_at LIMIT 50');
        for (const row of pending.rows) {
          if (controller.signal.aborted) break;
          try {
            // Receber webhook nunca confirma comercialmente um pedido.
            await processEvent(client, row.payload, async (event, order) => {
              const merchant = resolveMerchant(config.merchants, event.merchantId, order?.merchant?.id);
              await storeIfoodEvent(event, order, merchant.brand, false);
            });
            await pool.query('UPDATE ifood_webhook_inbox SET processed_at=now(), payload=NULL, attempts=attempts+1 WHERE event_id=$1', [row.event_id]);
          } catch {
            await pool.query("UPDATE ifood_webhook_inbox SET attempts=attempts+1, next_attempt_at=now()+interval '30 seconds' WHERE event_id=$1", [row.event_id]);
            console.error('[ifood webhook] evento pendente para nova tentativa');
          }
        }
        const stats = await pool.query('SELECT count(*)::int AS pending, min(received_at) AS oldest FROM ifood_webhook_inbox WHERE processed_at IS NULL');
        await writeFile(`${healthFile}.tmp`, JSON.stringify({ lastSuccess: Date.now(), lastReceipt, ...stats.rows[0] }));
        await rename(`${healthFile}.tmp`, healthFile);
      } catch { console.error('[ifood webhook] fila indisponível'); }
      await delay(1000, undefined, { signal: controller.signal }).catch(e => { if (e.name !== 'AbortError') throw e; });
    }
  } finally {
    server.close(); await pool.end(); process.off('SIGTERM', stop); process.off('SIGINT', stop);
  }
}
if (require.main === module) runWebhook().then(() => process.exit(0)).catch(() => { console.error('Falha ao iniciar webhook iFood'); process.exit(1); });
