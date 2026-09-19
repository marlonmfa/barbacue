import { z } from "zod";

const contextSchema = z.object({
  brand: z.enum(["barbacue", "barbadog", "chelas"]),
  channel: z.enum(["kiosk", "table_qr"]),
  tableToken: z.string().uuid().optional(),
});
export type PendingOrderContext = z.infer<typeof contextSchema>;
const pendingSchema = z.object({
  payload: contextSchema.extend({
    requestId: z.string().uuid(),
    customerName: z.string().max(80).optional(),
    paymentMethod: z.enum(["cash", "card_on_delivery"]),
    notes: z.string().max(500).optional(),
    items: z.array(z.object({
      productId: z.number().int().positive(),
      qty: z.number().int().min(1).max(20),
      notes: z.string().max(160).optional(),
    }).strict()).min(1).max(40),
  }).strict(),
  // A display snapshot is needed when the menu cannot be loaded after a timeout.
  // Only the payload is replayed; the server remains the authority for prices.
  products: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    priceCents: z.number().int().nonnegative(),
    imageUrl: z.string().nullable(),
  }).strict()).min(1).max(40),
}).strict();

export type PendingSelfServiceOrder = z.infer<typeof pendingSchema>;

export function pendingOrderStorageKey(context: PendingOrderContext): string {
  return `barbacue-pending-order:${context.brand}:${context.channel}:${context.tableToken ?? "pickup"}`;
}

export function parsePendingOrder(raw: string | null, context: PendingOrderContext): PendingSelfServiceOrder | null {
  if (!raw) return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const { payload, products } = parsed.data;
    if (payload.brand !== context.brand || payload.channel !== context.channel || payload.tableToken !== context.tableToken) return null;
    if (payload.items.some((item) => !products.some((product) => product.id === item.productId))) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
