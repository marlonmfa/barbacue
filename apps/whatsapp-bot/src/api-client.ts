import { config } from "./config.js";

export interface AgentItem {
  productId: number;
  name: string;
  priceCents: number;
  qty: number;
}

export interface ChatCustomer {
  name?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export interface ChatResponse {
  reply: string;
  cart: AgentItem[];
  customer: ChatCustomer;
  paymentMethod: string;
  navigate: boolean;
}

export type RestaurantBrand = "barbacue" | "barbadog" | "chelas";

export interface StoreStatus {
  open: boolean;
  reason: string;
  nextOpen: string | null;
  openingHours: string | null;
}

export interface CreatedOrder {
  orderId: string;
  paymentMethod: string;
  totalCents: number;
  deliveryFeeCents?: number;
  pix: { payload: string } | null;
}

export interface DeliveryQuote {
  quoteId: string;
  address: string;
  distanceMeters: number;
  durationSeconds: number;
  feeCents: number;
  expiresAt: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.webBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bot-token": config.botApiToken },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface the server's message so the conversation layer can relay it.
    const err = new Error(typeof data?.message === "string" ? data.message : typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
    (err as Error & { status?: number; body?: unknown }).status = res.status;
    (err as Error & { status?: number; body?: unknown }).body = data;
    throw err;
  }
  return data as T;
}

/** Drive the AI ordering agent. customerPhone marks the sender as "logged in". */
export async function chat(payload: {
  messages: { role: "user" | "assistant"; content: string }[];
  cart: AgentItem[];
  customer: ChatCustomer;
  paymentMethod: string;
  customerPhone: string;
  brand: RestaurantBrand;
}): Promise<ChatResponse> {
  return postJson<ChatResponse>("/api/chat", payload);
}

/** Create the order (server re-sources prices, validates hours + availability). */
export async function createOrder(payload: {
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  deliveryQuoteId?: string;
  items: { productId: number; qty: number }[];
  paymentMethod: string;
  channel: "chat";
  brand: RestaurantBrand;
}): Promise<CreatedOrder> {
  const order = await postJson<CreatedOrder>("/api/orders", payload);
  if (typeof order.orderId !== "string" || !order.orderId || !Number.isSafeInteger(order.totalCents) || order.totalCents < 0 || typeof order.paymentMethod !== "string") {
    throw new Error("Resposta do pedido incompleta.");
  }
  return order;
}

export async function deliveryEnabled(): Promise<boolean> {
  const res = await fetch(`${config.webBaseUrl}/api/delivery/quote`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("Não foi possível consultar as condições de entrega agora.");
  const data = await res.json() as { enabled?: unknown };
  if (typeof data.enabled !== "boolean") throw new Error("Não foi possível consultar as condições de entrega agora.");
  return data.enabled;
}

export async function quoteDelivery(address: string, brand: RestaurantBrand): Promise<DeliveryQuote> {
  return postJson<DeliveryQuote>("/api/delivery/quote", { address, brand });
}

export async function getStoreStatus(): Promise<StoreStatus> {
  const res = await fetch(`${config.webBaseUrl}/api/store-status`);
  return (await res.json()) as StoreStatus;
}
