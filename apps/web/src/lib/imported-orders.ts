import { createHash } from 'node:crypto';
import { z } from 'zod';

export const importedOrderSchema = z.object({
  source: z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N} ._-]+$/u).transform(s => s.toLowerCase()).refine(s => !['kiosk', 'table_qr'].includes(s), 'Use uma origem diferente de totem e QR.'),
  externalId: z.string().trim().min(1).max(128),
  brand: z.enum(['barbacue', 'barbadog', 'chelas']).default('barbacue'),
  customerName: z.string().trim().min(2).max(200),
  customerPhone: z.string().max(80).default(''),
  orderType: z.enum(['delivery', 'pickup']).default('pickup'),
  deliveryAddress: z.string().trim().max(1000).optional(),
  items: z.array(z.object({ name: z.string().trim().min(1).max(500), qty: z.number().int().min(1).max(99), priceCents: z.number().int().min(0).max(1000000), notes: z.string().max(2000).nullable().optional() })).min(1).max(100),
  notes: z.string().max(1800).optional(),
  discountCents: z.number().int().min(0).max(10000000).default(0),
  deliveryFeeCents: z.number().int().min(0).max(1000000).default(0),
  paymentMethod: z.enum(['pix', 'cash', 'card_on_delivery']).default('cash'),
  paymentStatus: z.enum(['pending', 'paid']).default('pending'),
}).superRefine((value, ctx) => {
  if (value.orderType === 'delivery' && !value.deliveryAddress) ctx.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'Informe o endereço da entrega.' });
  if (value.orderType === 'pickup' && value.deliveryFeeCents) ctx.addIssue({ code: 'custom', path: ['deliveryFeeCents'], message: 'Retirada não tem frete.' });
  const subtotal = value.items.reduce((sum, item) => sum + item.qty * item.priceCents, 0);
  if (subtotal > 10000000 || value.discountCents > subtotal) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Confira os valores e o desconto do pedido.' });
});
export const importBatchSchema = z.object({ orders: z.array(importedOrderSchema).min(1).max(50) });
export function importedOrderId(source: string, externalId: string, brand: string) {
  const hex = createHash('sha256').update(JSON.stringify(['barbacue-import-v1', source, externalId, brand])).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
