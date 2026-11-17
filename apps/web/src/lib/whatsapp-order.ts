import type { Brand } from "@/lib/brands";

export type WhatsAppPayment = "pix" | "cash" | "card_on_delivery";
export type WhatsAppFulfillment = "pickup" | "delivery";

export interface WhatsAppOrderItem {
  brand: Brand;
  name: string;
  priceCents: number;
  qty: number;
  notes?: string;
}

export interface WhatsAppOrderSummary {
  customerName: string;
  fulfillment: WhatsAppFulfillment;
  address?: string;
  paymentMethod: WhatsAppPayment;
  changeFor?: string;
  notes?: string;
  items: WhatsAppOrderItem[];
}

const BRAND_NAMES: Record<Brand, string> = { barbacue: "Barbacue", barbadog: "Barbadog", chelas: "Chelas" };
const PAYMENT_NAMES: Record<WhatsAppPayment, string> = { pix: "Pix", cash: "Dinheiro na entrega", card_on_delivery: "Cartão na entrega" };
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export function buildWhatsAppOrderMessage(order: WhatsAppOrderSummary): string {
  const lines = [
    "*NOVO PEDIDO — BARBA DELIVERY*",
    "",
    `*Cliente:* ${order.customerName.trim()}`,
    `*Recebimento:* ${order.fulfillment === "delivery" ? "Entrega" : "Retirada no balcão"}`,
  ];
  if (order.fulfillment === "delivery") lines.push(`*Endereço:* ${order.address?.trim() || "Não informado"}`);

  lines.push("", "*ITENS*");
  for (const brand of ["barbacue", "barbadog", "chelas"] as Brand[]) {
    const items = order.items.filter(item => item.brand === brand);
    if (!items.length) continue;
    lines.push(`_${BRAND_NAMES[brand]}_`);
    for (const item of items) {
      lines.push(`${item.qty}x ${item.name} — ${money(item.priceCents * item.qty)}`);
      if (item.notes?.trim()) lines.push(`  Obs.: ${item.notes.trim()}`);
    }
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
  lines.push("", `*Subtotal:* ${money(subtotal)}`, `*Pagamento:* ${PAYMENT_NAMES[order.paymentMethod]}`);
  if (order.paymentMethod === "cash" && order.changeFor?.trim()) lines.push(`*Troco para:* ${order.changeFor.trim()}`);
  if (order.notes?.trim()) lines.push(`*Observações gerais:* ${order.notes.trim()}`);
  lines.push("", "Pedido montado pelo cardápio Barba Delivery. Favor confirmar disponibilidade, frete e total antes de preparar.");
  return lines.join("\n");
}

export function buildWhatsAppOrderUrl(order: WhatsAppOrderSummary, phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsAppOrderMessage(order))}`;
}
