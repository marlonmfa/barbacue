import { Pool } from 'pg';
import './config';

/** Consulta somente de leitura; existência no banco usado pelo painel, não prova de renderização no navegador. */
export async function webhookAudit(pool: Pool, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Limite deve estar entre 1 e 200');
  return (await pool.query(`SELECT i.event_id, i.merchant_id, i.order_id, i.event_code,
    i.event_full_code, i.event_created_at, i.received_at, i.processed_at, i.attempts,
    i.local_order_id, i.local_status_at_processing,
    (o.id IS NOT NULL) AS panel_present, o.brand AS panel_brand,
    o.status AS panel_status, o.total_cents AS panel_total_cents,
    o.created_at AS panel_created_at
    FROM ifood_webhook_inbox i LEFT JOIN orders o
      ON o.id=i.local_order_id AND o.channel='ifood'
    ORDER BY i.received_at DESC, i.event_id LIMIT $1`, [limit])).rows;
}
if (require.main === module) {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000, query_timeout: 5000 });
  webhookAudit(pool).then(rows => console.log(JSON.stringify(rows, null, 2)))
    .catch(() => { console.error('Falha ao consultar auditoria iFood'); process.exitCode = 1; })
    .finally(() => pool.end());
}
