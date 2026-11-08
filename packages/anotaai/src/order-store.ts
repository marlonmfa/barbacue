import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { AnotaPageConfig } from './config';
import { mapAnotaOrder, type AnotaOrder } from './map';

export type LocalStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export const RANK: Record<LocalStatus, number> = { pending: 0, confirmed: 1, preparing: 2, ready: 3, delivered: 4, cancelled: 5 };

/** Id local determinístico (mesmo formato UUID v8 do monitor iFood). */
export function anotaLocalId(id: string) {
  const hex = createHash('sha256').update(`anotaai:${id}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** check da Anota AI → status do painel. 6 (pedido de cancelamento) e desconhecidos não mudam o status. */
export function localOfCheck(check: number | null | undefined): LocalStatus | null {
  switch (check) {
    case 0: return 'pending';
    case -2: case 1: return 'confirmed';
    case 2: return 'ready';
    case 3: return 'delivered';
    case 4: case 5: return 'cancelled';
    default: return null;
  }
}

/** Pedido da Anota AI → linha de `orders` (mesmo formato de itens do monitor iFood). */
export function toBarbacueOrder(o: AnotaOrder, page: AnotaPageConfig) {
  const m = mapAnotaOrder(o);
  if (!m.externalId || !/^[0-9a-f]{24}$/i.test(m.externalId)) throw new Error('Pedido Anota AI sem id');
  if (!m.items.length || m.items.length > 100) throw new Error('Pedido Anota AI sem itens válidos');
  const items = m.items.map(i => {
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99) throw new Error('Quantidade Anota AI não suportada; conferir pedido');
    const notes = [i.notes, ...i.addons].filter(Boolean).join('; ').slice(0, 2000);
    return { name: i.name.slice(0, 500), qty: i.quantity, priceCents: Math.round(i.totalCents / i.quantity), notes: notes || null };
  });
  const notes = [`Anota AI #${m.externalRef ?? m.externalId}`, `Pedido externo: ${m.externalId}`, `Loja Anota AI: ${page.name}`,
    m.ifoodId ? `Pedido iFood via Anota AI: ${m.ifoodId}` : '', m.tableLabel ? `Mesa: ${m.tableLabel}` : '', m.notes].filter(Boolean).join('\n').slice(0, 2000);
  return {
    id: anotaLocalId(m.externalId), brand: page.brand,
    customerName: m.customerName || 'Cliente Anota AI', customerPhone: m.customerPhone,
    orderType: m.fulfillment === 'DELIVERY' ? 'delivery' : m.fulfillment === 'DINE_IN' ? 'dine_in' : 'pickup',
    deliveryAddress: m.fulfillment === 'DELIVERY' ? m.addressText.slice(0, 2000) || null : null,
    items, subtotal: m.subtotalCents, discount: m.discountCents, fee: m.deliveryFeeCents, total: m.totalCents,
    paymentMethod: m.paymentMethod === 'CASH' ? 'cash' : m.paymentMethod === 'PIX' ? 'pix' : m.paymentMethod === 'CARD_ON_DELIVERY' ? 'card_on_delivery' : null,
    paid: m.prepaid, changeForCents: m.changeForCents || null, notes,
  };
}
export type BarbacueOrder = ReturnType<typeof toBarbacueOrder>;

/** Persistência usada pelo sync (injetável nos testes). */
export interface OrderStore {
  statuses(ids: string[]): Promise<Map<string, LocalStatus>>;
  insert(order: BarbacueOrder, status: LocalStatus): Promise<boolean>;
  /** Só avança (ou cancela); nunca mexe em pedido encerrado. */
  advance(id: string, status: LocalStatus): Promise<boolean>;
  appendNote(id: string, note: string): Promise<void>;
  check(): Promise<void>;
}

export function pgStore(databaseUrl = process.env.DATABASE_URL): OrderStore {
  if (!databaseUrl) throw new Error('Configure DATABASE_URL para registrar pedidos Anota AI no painel');
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000, query_timeout: 15_000, application_name: 'barbacue-anotaai-monitor' });
  return {
    async statuses(ids) {
      if (!ids.length) return new Map();
      const r = await pool.query("SELECT id, status::text AS status FROM orders WHERE id = ANY($1::uuid[]) AND channel='anotaai'", [ids]);
      return new Map(r.rows.map(row => [row.id as string, row.status as LocalStatus]));
    },
    async insert(x, status) {
      const r = await pool.query(`INSERT INTO orders (id,brand,customer_name,customer_phone,order_type,delivery_address,items,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,channel,status,payment_method,payment_status,change_for_cents,notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'anotaai',$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING`,
        [x.id, x.brand, x.customerName, x.customerPhone, x.orderType, x.deliveryAddress, JSON.stringify(x.items), x.subtotal, x.discount, x.fee, x.total, status, x.paymentMethod, x.paid ? 'paid' : 'pending', x.changeForCents, x.notes]);
      return !!r.rowCount;
    },
    async advance(id, status) {
      const r = await pool.query(`UPDATE orders SET status=$2::order_status WHERE id=$1 AND channel='anotaai' AND status NOT IN ('cancelled','delivered') AND
        ($2='cancelled' OR array_position(ARRAY['pending','confirmed','preparing','ready','delivered'], $2) > array_position(ARRAY['pending','confirmed','preparing','ready','delivered'], status::text)) RETURNING id`, [id, status]);
      return !!r.rowCount;
    },
    async appendNote(id, note) {
      await pool.query("UPDATE orders SET notes = left(coalesce(notes,'') || E'\\n' || $2, 2000) WHERE id=$1 AND channel='anotaai' AND position($2 in coalesce(notes,'')) = 0", [id, note]);
    },
    async check() {
      // Somente leitura; nunca aplica migrações no banco ativo.
      await pool.query('SELECT id, brand, channel, status, items, notes FROM orders LIMIT 0');
    },
  };
}
