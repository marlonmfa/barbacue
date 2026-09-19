import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { IfoodEvent, IfoodOrder } from './types';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const states: Record<string, string> = { PLC: 'pending', CFM: 'confirmed', PRS: 'preparing', RTP: 'ready', DSP: 'ready', CON: 'delivered', CAN: 'cancelled' };
export function ifoodLocalId(id: string) {
  const hex = createHash('sha256').update(`ifood:${id}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function cents(value: number | undefined, fallback = 0) {
  const n = value == null ? fallback : Math.round(value * 100);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000) throw new Error('Valor iFood inválido');
  return n;
}
export function mapIfoodOrder(order: IfoodOrder, brand = 'barbacue') {
  if (!['barbacue', 'barbadog', 'chelas'].includes(brand)) throw new Error('IFOOD_BRAND inválida');
  if (!order.id || !order.items?.length || order.items.length > 100) throw new Error('Pedido iFood sem itens válidos');
  const items = order.items.map(item => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new Error('Quantidade iFood não suportada; conferir pedido');
    if (!item.name || item.name.length > 500) throw new Error('Nome iFood inválido');
    const notes = [item.observations, ...(item.options ?? []).map(option => `${option.quantity}x ${option.name}`)].filter(Boolean).join('; ');
    if (notes.length > 2000) throw new Error('Observações iFood excedem o limite');
    return { name: item.name, qty: item.quantity, priceCents: item.totalPrice != null ? Math.round(cents(item.totalPrice) / item.quantity) : cents(item.unitPrice), notes: notes || null };
  });
  const address = order.delivery?.deliveryAddress;
  const deliveryAddress = address?.formattedAddress || [address?.streetName, address?.streetNumber, address?.complement, address?.neighborhood, address?.city, address?.state, address?.reference].filter(Boolean).join(', ');
  const method = order.payments?.methods?.find(m => m.type === 'OFFLINE')?.method?.trim();
  const subtotal = cents(order.total?.subTotal, items.reduce((sum, i) => sum + i.qty * i.priceCents, 0));
  const fee = cents(order.total?.deliveryFee);
  const discount = cents(order.total?.benefits);
  const total = cents(order.total?.orderAmount, Math.max(0, subtotal + fee + cents(order.total?.additionalFees) - discount));
  const scheduled = order.orderTiming === 'SCHEDULED' ? `AGENDADO: conferir preparo em ${order.preparationStartDateTime ?? order.delivery?.deliveryDateTime ?? 'horário do iFood'}` : '';
  const notes = [`iFood #${order.displayId ?? order.id}`, scheduled, `Pago online: R$ ${(cents(order.payments?.prepaid) / 100).toFixed(2)}; cobrar: R$ ${(cents(order.payments?.pending) / 100).toFixed(2)}`, `Formas no iFood: ${(order.payments?.methods ?? []).map(m => `${m.method} ${m.type}`).join(', ')}`, order.extraInfo, 'Status externo: acompanhe e altere no gestor iFood.'].filter(Boolean).join('\n');
  if (notes.length > 2000 || (deliveryAddress?.length ?? 0) > 2000) throw new Error('Dados iFood excedem o limite de impressão');
  return { id: ifoodLocalId(order.id), brand, items, deliveryAddress, subtotal, fee, discount, total, notes,
    orderType: order.orderType === 'DELIVERY' ? 'delivery' : ['INDOOR', 'DINE_IN'].includes(order.orderType ?? '') ? 'dine_in' : 'pickup',
    paymentMethod: method === 'CASH' ? 'cash' : method === 'PIX' ? 'pix' : null,
    paid: order.payments?.pending === 0 && (order.payments?.prepaid ?? -1) >= total / 100,
    changeForCents: cents(order.payments?.methods?.find(m => m.cash?.changeFor)?.cash?.changeFor),
  };
}
export async function storeIfoodEvent(event: IfoodEvent, order: IfoodOrder | null) {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para registrar pedidos iFood no painel');
  if (process.env.IFOOD_DRY_RUN === 'true') return;
  const state = states[event.code];
  if (!state) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (order) {
      const x = mapIfoodOrder(order, process.env.IFOOD_BRAND || 'barbacue');
      await client.query(`INSERT INTO orders (id,brand,customer_name,customer_phone,order_type,delivery_address,items,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,channel,status,payment_method,payment_status,change_for_cents,notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ifood',$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING`,
        [x.id,x.brand,order.customer?.name || 'Cliente iFood',order.customer?.phone?.number || '',x.orderType,x.deliveryAddress || null,JSON.stringify(x.items),x.subtotal,x.discount,x.fee,x.total,state,x.paymentMethod,x.paid ? 'paid' : 'pending',x.changeForCents,x.notes]);
      // Scheduled orders remain visible now, but print at preparation time.
      if (order.orderTiming === 'SCHEDULED') {
        const start = Date.parse(String(order.preparationStartDateTime ?? order.delivery?.deliveryDateTime ?? ''));
        if (!Number.isFinite(start)) throw new Error('Pedido agendado sem horário de preparo; conferir no iFood');
        await client.query(`UPDATE kitchen_print_jobs SET next_attempt_at = greatest(next_attempt_at, $2::timestamptz) WHERE order_id=$1 AND status='queued' AND attempts=0`, [x.id, new Date(start)]);
      }
    }
    // Events can be redelivered or arrive late: never regress a terminal order.
    const result = await client.query(`UPDATE orders SET status=$2::order_status WHERE id=$1 AND channel='ifood' AND status NOT IN ('cancelled','delivered') AND
      ($2='cancelled' OR array_position(ARRAY['pending','confirmed','preparing','ready','delivered'], $2) >= array_position(ARRAY['pending','confirmed','preparing','ready','delivered'], status::text)) RETURNING id`, [ifoodLocalId(event.orderId),state]);
    if (!order && !result.rowCount) {
      const existing = await client.query('SELECT id FROM orders WHERE id=$1', [ifoodLocalId(event.orderId)]);
      if (!existing.rowCount) throw new Error('Pedido iFood ainda não registrado; evento será retomado');
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
