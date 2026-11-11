// Comandas em PDF para conferência no painel: o mesmo texto que o agente de
// impressão envia à Elgin (apps/print-agent), sem precisar ligar a impressora.
import QRCode from "qrcode";
// Mesmo código do agente de impressão e do app Windows.
import { formatTicket, itemBrand } from "../../../print-agent/src/ticket.mjs";
import { ticketPdf, ticketParts } from "../../../print-agent/src/pdf.mjs";
import type { Brand } from "./brands";

export const ELGIN_PAPER = 80;

/** Texto de cada parte da comanda (uma por cozinha em pedidos de vários restaurantes). */
export function ticketTextParts(ticket: unknown): string[] {
  return ticketParts(formatTicket(ticket, { columns: 48 })) as string[];
}

/** Restaurante de cada parte, na ordem em que saem da impressora. */
export function ticketPartBrands(ticket: { brand: Brand; items?: { restaurant?: string | null }[] }): Brand[] {
  const order: Brand[] = ["chelas", "barbacue", "barbadog"];
  const used = new Set((ticket.items ?? []).map((item) => itemBrand(item, ticket.brand) as Brand));
  return order.filter((brand) => used.has(brand));
}

export function ticketPartPdf(ticket: unknown, part: number): Buffer | null {
  const parts = ticketTextParts(ticket);
  const text = parts[part - 1];
  if (!text) return null;
  return ticketPdf(text, { paper: ELGIN_PAPER, qr: (url: string) => {
    const m = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
    return { size: m.size, get: (x: number, y: number) => Boolean(m.get(x, y)) };
  } });
}
