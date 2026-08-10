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
  pix: { payload: string } | null;
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
    const err = new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
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
}): Promise<ChatResponse> {
  return postJson<ChatResponse>("/api/chat", payload);
}

/** Create the order (server re-sources prices, validates hours + availability). */
export async function createOrder(payload: {
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  items: { productId: number; qty: number }[];
  paymentMethod: string;
  channel: "chat";
}): Promise<CreatedOrder> {
  return postJson<CreatedOrder>("/api/orders", payload);
}

export async function getStoreStatus(): Promise<StoreStatus> {
  const res = await fetch(`${config.webBaseUrl}/api/store-status`);
  return (await res.json()) as StoreStatus;
}
