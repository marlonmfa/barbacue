import type { Brand } from "./brands";

export type OnlinePaymentMethod = "pix" | "cash" | "card_on_delivery";

export const PAY_ON_RECEIPT = "pay-on-receipt";

export function onlineMinimumCents(brand: Brand, orderType: "pickup" | "delivery" | "dine_in") {
  return brand === "barbacue" && orderType === "delivery" ? 2000 : 0;
}

export function onlinePaymentLabel(method: OnlinePaymentMethod, orderType: string) {
  if (method === "pix") return "Pix online";
  const where = orderType === "pickup" ? "na retirada" : "na entrega";
  return `${method === "cash" ? "Dinheiro" : "Cartão"} ${where}`;
}
