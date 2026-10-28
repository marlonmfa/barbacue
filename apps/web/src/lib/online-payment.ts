import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  for (const length of [9, 10]) {
    const sum = [...value.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(value[length])) return false;
  }
  return true;
}
const text = (max: number) => z.string().trim().max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), "Texto inválido.");
export const onlineOrderSchema = z.object({
  requestId: z.string().uuid().transform(s => s.toLowerCase()),
  accessToken: z.string().regex(/^[a-f0-9]{64}$/),
  brand: z.enum(["barbacue", "barbadog", "chelas"]),
  customerName: text(80).pipe(z.string().min(2, "Informe seu nome.")),
  customerPhone: z.string().transform(s => s.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")).pipe(z.string().regex(/^\d{10,11}$/, "Informe um telefone com DDD.")),
  cpf: z.string().transform(s => s.replace(/\D/g, "")).refine(validCpf, "Informe um CPF válido para o pagamento."),
  orderType: z.enum(["pickup", "delivery", "dine_in"]),
  tableToken: z.string().uuid().optional(),
  deliveryAddress: text(400).optional(),
  deliveryQuoteId: z.string().uuid().optional(),
  notes: text(500).optional(),
  items: z.array(z.object({ productId: z.number().int().positive(), qty: z.number().int().min(1).max(20), notes: text(160).optional() }).strict()).min(1).max(60),
}).strict().superRefine((input, ctx) => {
  if (input.orderType === "dine_in" && !input.tableToken) ctx.addIssue({ code: "custom", message: "Escaneie o QR Code da mesa.", path: ["tableToken"] });
  if (input.orderType === "delivery" && (input.deliveryAddress?.length ?? 0) < 12) ctx.addIssue({ code: "custom", message: "Informe rua, número, bairro e cidade.", path: ["deliveryAddress"] });
  if (input.items.reduce((n, item) => n + item.qty, 0) > 100) ctx.addIssue({ code: "custom", message: "Limite de 100 itens por pedido.", path: ["items"] });
});
export type OnlineOrderInput = z.infer<typeof onlineOrderSchema>;
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function secureEquals(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export const paymentReference = (orderId: string) => `barbacue:order:${orderId}`;
export interface AsaasPayment { id: string; customer: string; externalReference: string; value: number; status: string; billingType: string; deleted?: boolean }
export function assertPaymentMatches(payment: AsaasPayment, expected: { paymentId?: string | null; customerId: string; orderId: string; totalCents: number }) {
  if ((expected.paymentId && payment.id !== expected.paymentId) || payment.customer !== expected.customerId || payment.externalReference !== paymentReference(expected.orderId) || payment.billingType !== "PIX" || !Number.isFinite(payment.value) || Math.abs(payment.value * 100 - expected.totalCents) > 0.001) {
    throw new OnlinePaymentError("A cobrança precisa ser conferida pela equipe. Nenhum pedido foi liberado.", 409);
  }
}
export function asaasPaymentState(payment: Pick<AsaasPayment, "status" | "deleted">): "paid" | "pending" | "failed" {
  if (payment.deleted) return "failed";
  if (["CONFIRMED", "RECEIVED"].includes(payment.status)) return "paid";
  if (["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL", "DELETED"].includes(payment.status)) return "failed";
  return "pending";
}
export class OnlinePaymentError extends Error {
  constructor(message: string, public status = 503, public uncertain = false) { super(message); }
}
export function onlineErrorResponse(error: unknown) {
  const known = error instanceof OnlinePaymentError;
  return Response.json({ message: known ? error.message : "Não foi possível confirmar o pagamento agora. Tente consultar novamente; seu pedido não será duplicado." }, { status: known ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
