import { config } from "./config.js";
import {
  chat,
  createOrder,
  getStoreStatus,
  type AgentItem,
  type ChatCustomer,
} from "./api-client.js";

interface ConvState {
  messages: { role: "user" | "assistant"; content: string }[];
  cart: AgentItem[];
  customer: ChatCustomer;
  paymentMethod: string;
  lastActivity: number;
}

// In-memory per-contact state, keyed by phone number. Survives a conversation
// but not a restart — intentionally simple; the web API holds the durable data.
const sessions = new Map<string, ConvState>();

function getSession(phone: string): ConvState {
  let s = sessions.get(phone);
  if (!s) {
    s = { messages: [], cart: [], customer: { phone }, paymentMethod: "pix", lastActivity: Date.now() };
    sessions.set(phone, s);
  }
  s.lastActivity = Date.now();
  return s;
}

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const PAYMENT_LABEL: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro na entrega",
  card_on_delivery: "Cartão na entrega",
};

/**
 * Process one inbound WhatsApp message and return the text(s) to send back.
 * Returns multiple messages when an order is finalized (reply + payment).
 */
export async function handleMessage(phone: string, text: string): Promise<string[]> {
  const s = getSession(phone);
  s.messages.push({ role: "user", content: text });
  // Keep the context window bounded (the web agent also trims to 20).
  if (s.messages.length > 20) s.messages = s.messages.slice(-20);

  let res;
  try {
    res = await chat({
      messages: s.messages,
      cart: s.cart,
      customer: s.customer,
      paymentMethod: s.paymentMethod,
      customerPhone: phone,
    });
  } catch (err) {
    console.error("[conversation] chat error", err);
    return ["Tive um probleminha aqui 😕. Pode repetir, por favor?"];
  }

  // Adopt the agent's new truth.
  s.cart = res.cart;
  s.customer = res.customer;
  s.paymentMethod = res.paymentMethod;
  s.messages.push({ role: "assistant", content: res.reply });

  const out = [res.reply];

  if (res.navigate) {
    const finalize = await finalizeOrder(s);
    out.push(...finalize);
  }

  return out;
}

async function finalizeOrder(s: ConvState): Promise<string[]> {
  // Defensive pre-check so we can give a friendly message; /api/orders enforces too.
  try {
    const status = await getStoreStatus();
    if (!status.open) {
      return [
        `😴 ${status.reason}${status.nextOpen ? ` ${status.nextOpen}` : ""}\nSeu pedido foi anotado — é só confirmar quando reabrirmos!`,
      ];
    }
  } catch {
    /* if status check fails, let the order endpoint be the gate */
  }

  if (!s.customer.name || !s.customer.phone) {
    return ["Antes de finalizar, preciso do seu nome e telefone 🙂"];
  }
  if (s.cart.length === 0) {
    return ["Seu carrinho está vazio. O que você gostaria de pedir?"];
  }

  let order;
  try {
    order = await createOrder({
      customerName: s.customer.name,
      customerPhone: s.customer.phone,
      deliveryAddress: s.customer.address,
      items: s.cart.map((i) => ({ productId: i.productId, qty: i.qty })),
      paymentMethod: s.paymentMethod,
      channel: "chat",
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    // 422 from the order endpoint carries a user-facing reason (closed/unavailable).
    if (e.status === 422) return [`Não consegui finalizar: ${e.message}`];
    console.error("[conversation] createOrder error", err);
    return ["Não consegui registrar o pedido agora. Pode tentar de novo em instantes?"];
  }

  // Order placed — clear the cart but keep the customer for the next order.
  const placedTotal = order.totalCents;
  s.cart = [];
  s.messages = [];

  const lines: string[] = [];
  lines.push(
    `✅ Pedido confirmado! Total: ${fmt(placedTotal)} • Pagamento: ${PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}`,
  );

  // Always offer the web (and app) link to track / pay. Use the PUBLIC url so
  // the customer can actually open it (webBaseUrl may be Docker-internal).
  const webLink = `${config.publicSiteUrl}/confirmation/${order.orderId}`;
  let linkLine = `🌐 Acompanhe pelo site: ${webLink}`;
  if (config.appDeeplinkBase) {
    linkLine += `\n📱 Ou abra no app: ${config.appDeeplinkBase}${order.orderId}`;
  }
  lines.push(linkLine);

  // Build the messages array: confirmation + (Pix copy-paste as its own message
  // so it's easy to long-press and copy).
  const messages = [lines.join("\n")];
  if (order.paymentMethod === "pix" && order.pix?.payload) {
    messages.push(
      "💸 *Pix copia e cola* — toque para copiar e pague no seu banco:",
    );
    messages.push(order.pix.payload);
  }

  return messages;
}

/** Periodic cleanup of idle conversations. */
export function sweepIdleSessions(): void {
  const cutoff = Date.now() - config.sessionTtlMs;
  for (const [phone, s] of sessions) {
    if (s.lastActivity < cutoff) sessions.delete(phone);
  }
}
