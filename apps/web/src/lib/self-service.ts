import { createHash } from "node:crypto";
import { z } from "zod";

const safeText = (max: number) => z.string().trim().max(max)
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Texto contém caracteres inválidos.");

export const selfServiceOrderSchema = z.object({
  requestId: z.string().uuid().toLowerCase(),
  channel: z.enum(["kiosk", "table_qr"]),
  tableToken: z.string().uuid().toLowerCase().optional(),
  brand: z.enum(["barbacue", "chelas", "barbadog"]),
  customerName: safeText(80).optional(),
  paymentMethod: z.enum(["cash", "card_on_delivery"]),
  notes: safeText(500).optional(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    qty: z.number().int().min(1).max(20),
    notes: safeText(160).optional(),
  }).strict()).min(1).max(40),
}).strict().superRefine((value, ctx) => {
  if (value.channel === "table_qr" && !value.tableToken) {
    ctx.addIssue({ code: "custom", path: ["tableToken"], message: "Escaneie o QR Code da mesa para pedir." });
  }
  if (value.channel === "kiosk" && !value.tableToken && (value.customerName?.length ?? 0) < 2) {
    ctx.addIssue({ code: "custom", path: ["customerName"], message: "Informe seu nome para a retirada (pelo menos 2 letras)." });
  }
  if (value.items.reduce((sum, item) => sum + item.qty, 0) > 100) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "Limite de 100 unidades por pedido." });
  }
});

export type SelfServiceOrderInput = z.infer<typeof selfServiceOrderSchema>;
export type SelfServiceItem = { productId: number; name: string; priceCents: number; qty: number; notes: string | null };
export type SelfServiceReceipt = {
  orderId: string;
  orderType: "dine_in" | "pickup";
  tableNumber: number | null;
  totalCents: number;
  items: SelfServiceItem[];
  status: "confirmed";
  printStatus: "queued";
};

/** The normalized request, not current prices/hours, identifies a retry. */
export function selfServiceRequestHash(input: SelfServiceOrderInput): string {
  return createHash("sha256").update(JSON.stringify({
    channel: input.channel, tableToken: input.tableToken ?? null, brand: input.brand,
    customerName: input.customerName || null, paymentMethod: input.paymentMethod,
    notes: input.notes || null,
    items: input.items.map(item => ({ productId: item.productId, qty: item.qty, notes: item.notes || null })),
  })).digest("hex");
}

export function canonicalSelfServiceItems(
  requested: SelfServiceOrderInput["items"],
  products: { id: number; name: string; priceCents: number; available: boolean | null }[],
): SelfServiceItem[] {
  const byId = new Map(products.map(product => [product.id, product]));
  return requested.map(item => {
    const product = byId.get(item.productId);
    if (!product?.available || !Number.isSafeInteger(product.priceCents) || product.priceCents < 0) {
      throw new SelfServiceError("Um item está indisponível. Atualize seu pedido.", 422, "item_unavailable");
    }
    return { productId: product.id, name: product.name, priceCents: product.priceCents, qty: item.qty, notes: item.notes || null };
  });
}

export class SelfServiceError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message); this.status = status; this.code = code;
  }
}
