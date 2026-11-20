import { sql } from "drizzle-orm";
import { db } from "@/db";
import { BRANDS, entryMonth, type Brand, type EntryFact, type FinanceReport, type SaleFact } from "./engine";

type SaleRow = {
  day: string;
  brand: Brand;
  channel: SaleFact["channel"];
  orders: number;
  items: string;
  discount: string;
  delivery: string;
  total: string;
};

type EntryRow = {
  id: string;
  brand: Brand;
  kind: EntryFact["kind"];
  category: string;
  description: string;
  amount: string;
  competence: string | null;
  due: string;
  settled: string | null;
  status: EntryFact["status"];
};

export async function loadFinanceReport(): Promise<FinanceReport> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const brands = sql.join(BRANDS.map((brand) => sql`${brand}`), sql`, `);
  const [saleResult, entryResult] = await db.transaction(async (tx) => {
    const { rows: [schema] } = await tx.execute<{ has_cash: boolean }>(sql`
      SELECT to_regclass('cash_entries') IS NOT NULL AS has_cash
    `);
    const cashEntries = schema.has_cash ? sql`
      UNION ALL
      SELECT 'cash:' || e.id, o.brand, CASE WHEN e.kind = 'refund' THEN 'payable' ELSE 'receivable' END,
             CASE WHEN e.kind = 'refund' THEN 'order_refund'
                  WHEN e.method = 'pix' THEN 'order_pix'
                  WHEN e.method = 'cash' THEN 'order_cash'
                  WHEN e.method IN ('card', 'card_on_delivery') THEN 'order_card'
                  ELSE 'order_other' END,
             CASE WHEN e.kind = 'refund' THEN 'Estorno de pedido ' ELSE 'Recebimento de pedido ' END || left(o.id::text, 8),
             e.amount_cents, NULL, (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
             (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date, 'settled'
        FROM cash_entries e
        JOIN orders o ON o.id = e.order_id
       WHERE e.kind IN ('receipt', 'refund') AND o.channel IS DISTINCT FROM 'test'
    ` : sql``;
    const avoidDuplicate = schema.has_cash ? sql`
      AND NOT EXISTS (SELECT FROM cash_entries e WHERE e.order_id = o.id AND e.kind = 'receipt')
    ` : sql``;

    const sales = await tx.execute<SaleRow>(sql`
      SELECT ((o.created_at AT TIME ZONE 'America/Sao_Paulo')::date)::text AS day,
             o.brand, CASE WHEN o.channel = 'ifood' THEN 'ifood' ELSE 'own' END AS channel,
             count(*)::int AS orders, sum(o.subtotal_cents) AS items,
             coalesce(sum(o.discount_cents), 0) AS discount,
             sum(o.delivery_fee_cents) AS delivery, sum(o.total_cents) AS total
        FROM orders o
        LEFT JOIN online_checkouts c ON c.order_id = o.id
       WHERE o.brand IN (${brands})
         AND o.status IS DISTINCT FROM 'cancelled'
         AND o.channel IS DISTINCT FROM 'test'
         AND (o.channel = 'ifood' OR o.status NOT IN ('pending', 'cancelled'))
         AND (c.id IS NULL OR c.environment IN ('production', 'c6:production'))
         AND (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${today}::date
       GROUP BY 1, 2, 3
       ORDER BY 1, 2, 3
    `);
    const entries = await tx.execute<EntryRow>(sql`
      WITH movements AS (
        SELECT 'erp:' || f.id AS id, f.brand, f.kind, f.category, f.description,
               f.amount_cents AS amount, f.competence, f.due_date AS due, f.settled_date AS settled, f.status
          FROM erp_finance f
         WHERE f.status IN ('open', 'settled') AND f.kind IN ('receivable', 'payable')
        ${cashEntries}
        UNION ALL
        SELECT 'online:' || c.id, o.brand, 'receivable', 'order_online', 'Recebimento online ' || left(o.id::text, 8),
               o.total_cents, NULL, (c.paid_at AT TIME ZONE 'America/Sao_Paulo')::date,
               (c.paid_at AT TIME ZONE 'America/Sao_Paulo')::date, 'settled'
          FROM online_checkouts c
          JOIN orders o ON o.id = c.order_id
         WHERE c.environment IN ('production', 'c6:production') AND c.paid_at IS NOT NULL
           AND o.channel = 'online'
           ${avoidDuplicate}
      )
      SELECT id, brand, kind, category, description, amount, competence, due::text, settled::text, status
        FROM movements
       WHERE brand IN (${brands}) AND (settled IS NULL OR settled <= ${today}::date)
       ORDER BY coalesce(settled, due) DESC, id
    `);
    return [sales, entries] as const;
  }, { accessMode: "read only", isolationLevel: "repeatable read" });

  const sales: SaleFact[] = saleResult.rows.map((row) => ({
    date: row.day, brand: row.brand, channel: row.channel, orders: row.orders,
    itemsCents: Number(row.items), discountCents: Number(row.discount),
    deliveryFeeCents: Number(row.delivery), totalCents: Number(row.total),
  }));
  const entries: EntryFact[] = entryResult.rows.map((row) => ({
    id: row.id, brand: row.brand, kind: row.kind, category: row.category,
    description: row.description, amountCents: Number(row.amount), competence: row.competence,
    dueDate: row.due, settledDate: row.settled, status: row.status,
  }));
  const firstDate = entries.reduce((first, entry) => {
    const competenceDate = `${entryMonth(entry)}-01`;
    const date = entry.settledDate && entry.settledDate < competenceDate ? entry.settledDate : competenceDate;
    return date < first ? date : first;
  }, sales[0]?.date ?? today);
  return { sales, entries, today, firstDate };
}
