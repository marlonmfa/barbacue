import { timingSafeEqual } from "node:crypto";

export type KitchenPrintStatus = "queued" | "printing" | "printed" | "failed" | "uncertain";
export type KitchenTicket = {
  version: 1 | 2;
  orderId: string;
  orderNumber: string;
  brand: "barbacue" | "chelas" | "barbadog";
  channel: string;
  orderType: "pickup" | "dine_in" | "delivery";
  tableNumber: number | null;
  tableLabel: string | null;
  customerName: string | null;
  items: { name: string; qty: number; notes: string | null; priceCents?: number; price_cents?: number }[];
  notes: string | null;
  createdAt: string;
  payment: { method: string | null; status: string; label: string };
  status?: string;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  subtotalCents?: number;
  discountCents?: number;
  deliveryFeeCents?: number;
  totalCents?: number;
  changeForCents?: number | null;
  reprint: boolean;
};

export const PRINT_LEASE_SECONDS = 120;
export const MAX_PRINT_ATTEMPTS = 5;

export function printAgentConfigured(secret: string | undefined): boolean {
  return Boolean(secret && secret.length >= 32 && secret.trim() === secret);
}

export function validPrintAgentAuthorization(header: string | null, secret: string | undefined): boolean {
  if (!printAgentConfigured(secret) || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret!);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** A write might have reached paper: only an operator may retry it. */
export function printFailureStatus(attempts: number, uncertain: boolean): KitchenPrintStatus {
  if (uncertain) return "uncertain";
  return attempts >= MAX_PRINT_ATTEMPTS ? "failed" : "queued";
}

export function printRetryDelaySeconds(attempts: number): number {
  return Math.min(300, 5 * 2 ** Math.max(0, attempts - 1));
}
