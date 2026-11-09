import { sql } from "drizzle-orm";
import { db } from "@/db";
import { BRANDS, type Brand, type EntryFact, type SaleFact } from "./engine";

const isBrand = (v: unknown): v is Brand => BRANDS.includes(v as Brand);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/**
 * Vendas agregadas por dia (fuso de São Paulo), loja, canal e forma de pagamento.
 * Pedido próprio só conta depois de aceito (pendente pode nunca acontecer);
 * pedido do iFood conta desde a entrada, salvo cancelado. Pedidos de teste ficam fora.
 */
export async function loadSales(to: string): Promise<SaleFact[]> {
  const { rows } = await db.execute(sql`
    SELECT (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
           o.brand,
           CASE WHEN o.channel = 'ifood' THEN 'ifood' ELSE 'own' END AS channel,
           CASE
             WHEN o.channel = 'ifood' AND o.payment_method IS NULL THEN 'online'
             WHEN o.payment_method = 'pix' THEN 'pix'
             WHEN o.payment_method = 'cash' THEN 'cash'
             ELSE 'card'
           END AS payment,
           count(*)::int AS orders,
           coalesce(sum(o.subtotal_cents), 0)::bigint AS items,
           coalesce(sum(o.discount_cents), 0)::bigint AS discount,
           coalesce(sum(o.delivery_fee_cents), 0)::bigint AS delivery,
           coalesce(sum(o.total_cents), 0)::bigint AS total
      FROM orders o
     WHERE o.status <> 'cancelled'
       AND coalesce(o.channel, 'click') <> 'test'
       AND (o.channel = 'ifood' OR o.status <> 'pending')
       AND (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${to}::date
     GROUP BY 1, 2, 3, 4`);
  return (rows as Record<string, unknown>[])
    .filter((r) => isBrand(r.brand))
    .map((r) => ({
      date: iso(r.day),
      brand: r.brand as Brand,
      channel: r.channel as SaleFact["channel"],
      payment: r.payment as SaleFact["payment"],
      orders: Number(r.orders),
      itemsCents: Number(r.items),
      discountCents: Number(r.discount),
      deliveryFeeCents: Number(r.delivery),
      totalCents: Number(r.total),
    }));
}

/** Lançamentos do ERP que não foram cancelados. */
export async function loadEntries(): Promise<EntryFact[]> {
  const { rows } = await db.execute(sql`
    SELECT id, brand, kind, category, description, amount_cents, competence,
           due_date, settled_date, status
      FROM erp_finance
     WHERE status <> 'cancelled'`);
  return (rows as Record<string, unknown>[])
    .filter((r) => isBrand(r.brand))
    .map((r) => ({
      id: Number(r.id),
      brand: r.brand as Brand,
      kind: r.kind === "receivable" ? "receivable" : "payable",
      category: String(r.category),
      description: String(r.description),
      amountCents: Number(r.amount_cents),
      competence: r.competence ? String(r.competence) : null,
      dueDate: iso(r.due_date),
      settledDate: r.settled_date ? iso(r.settled_date) : null,
      status: r.status === "settled" ? "settled" : "open",
    }));
}

/** Primeiro dia com venda registrada, para sugerir o início do histórico. */
export async function firstSaleDate(): Promise<string | null> {
  const { rows } = await db.execute(sql`
    SELECT min((created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS d FROM orders
     WHERE coalesce(channel, 'click') <> 'test'`);
  const d = (rows as Record<string, unknown>[])[0]?.d;
  return d ? iso(d) : null;
}
