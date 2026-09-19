import { config } from "./config.js";
import {
  chat,
  createOrder,
  getStoreStatus,
  deliveryEnabled,
  quoteDelivery,
  type AgentItem,
  type ChatCustomer,
  type RestaurantBrand,
  type DeliveryQuote,
} from "./api-client.js";

interface ConvState {
  messages: { role: "user" | "assistant"; content: string }[];
  cart: AgentItem[];
  customer: ChatCustomer;
  paymentMethod: string;
  lastActivity: number;
  brand: RestaurantBrand | null;
  pendingDelivery?: { quote: DeliveryQuote; fingerprint: string };
  orderOutcomeUnknown?: boolean;
}

// In-memory per-contact state, keyed by phone number. Survives a conversation
// but not a restart — intentionally simple; the web API holds the durable data.
const sessions = new Map<string, ConvState>();
const inFlight = new Map<string, Promise<RoutedReply>>();

function getSession(phone: string): ConvState {
  let s = sessions.get(phone);
  if (!s) {
    s = { messages: [], cart: [], customer: { phone }, paymentMethod: "pix", lastActivity: Date.now(), brand: null };
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
export interface RoutedReply {
  messages: string[];
  brand: RestaurantBrand | null;
}

const BRAND_NAME: Record<RestaurantBrand, string> = {
  barbacue: "Barbacue",
  barbadog: "Barbadog",
  chelas: "Chelas",
};

function brandChoice(text: string): RestaurantBrand | null {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/^(1|barbacue|barbecue)\b/.test(normalized) || normalized.includes("barbacue")) return "barbacue";
  if (/^(2|barbadog|barbadogs|bargadog)\b/.test(normalized) || normalized.includes("barbadog")) return "barbadog";
  if (/^(3|chelas)\b/.test(normalized) || normalized.includes("chelas")) return "chelas";
  return null;
}

const ROUTING_MENU = "Olá! 👋 Qual restaurante você quer pedir?\n\n1️⃣ Barbacue\n2️⃣ Barbadog\n3️⃣ Chelas\n\nResponda com o número ou o nome da marca.";
const UNCERTAIN_ORDER = "A conexão caiu antes de eu receber a confirmação. O pedido pode já ter entrado na loja, por isso não vou reenviar este carrinho. Confira com a equipe antes de pedir outra vez. Para iniciar outra compra depois de conferir, escreva NOVO PEDIDO.";

export async function handleMessage(phone: string, text: string): Promise<RoutedReply> {
  // Serialize messages from the same contact, including repeated confirmations.
  // Otherwise two inbound events can place the same in-memory cart concurrently.
  const previous = inFlight.get(phone);
  const next = (previous ? previous.catch(() => undefined) : Promise.resolve())
    .then(() => processMessage(phone, text));
  inFlight.set(phone, next);
  try { return await next; }
  finally { if (inFlight.get(phone) === next) inFlight.delete(phone); }
}

async function processMessage(phone: string, text: string): Promise<RoutedReply> {
  const s = getSession(phone);
  if (s.orderOutcomeUnknown) {
    if (!/^novo pedido[.!\s]*$/i.test(text.trim())) return { messages: [UNCERTAIN_ORDER], brand: s.brand };
    s.orderOutcomeUnknown = false;
    s.pendingDelivery = undefined;
    s.cart = [];
    s.messages = [];
    return { messages: ["Vamos começar outra compra. O que gostaria de pedir?"], brand: s.brand };
  }
  const chosen = brandChoice(text.trim());
  if (!s.brand && !chosen) return { messages: [ROUTING_MENU], brand: null };
  if (chosen && chosen !== s.brand) {
    s.brand = chosen;
    s.cart = [];
    s.messages = [];
    s.pendingDelivery = undefined;
  }
  if (!s.brand) return { messages: [ROUTING_MENU], brand: null };

  if (/^confirmar entrega[.!\s]*$/i.test(text.trim()) && s.pendingDelivery) {
    return { messages: await finalizeOrder(s, true), brand: s.brand };
  }
  // Editing an address, item or payment requires a fresh review of the fee.
  s.pendingDelivery = undefined;

  // A bare selection gets a deterministic handoff; the next message is handled
  // by that restaurant's specialized catalog agent.
  if (/^(1|2|3|barbacue|barbecue|barbadog|barbadogs|bargadog|chelas)[.!\s]*$/i.test(text.trim())) {
    return {
      messages: [`Você está falando com o agente do *${BRAND_NAME[s.brand]}*. O que gostaria de pedir?`],
      brand: s.brand,
    };
  }

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
      brand: s.brand,
    });
  } catch (err) {
    console.error("[conversation] chat error", err);
    return { messages: ["Tive um probleminha aqui 😕. Pode repetir, por favor?"], brand: s.brand };
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

  return { messages: out, brand: s.brand };
}

function deliveryFingerprint(s: ConvState): string {
  return JSON.stringify({ brand: s.brand, cart: s.cart, customer: s.customer, paymentMethod: s.paymentMethod });
}

async function finalizeOrder(s: ConvState, deliveryConfirmed = false): Promise<string[]> {
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

  let deliveryQuoteId: string | undefined;
  try {
    if (await deliveryEnabled()) {
      if (!s.customer.address?.trim()) return ["Informe rua, número, bairro e cidade para calcular o frete antes de confirmar."];
      const fingerprint = deliveryFingerprint(s);
      const pending = s.pendingDelivery;
      if (deliveryConfirmed && pending?.fingerprint === fingerprint && Date.parse(pending.quote.expiresAt) > Date.now()) {
        deliveryQuoteId = pending.quote.quoteId;
      } else {
        const quote = await quoteDelivery(s.customer.address, s.brand ?? "barbacue");
        s.pendingDelivery = { quote, fingerprint };
        const subtotal = s.cart.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
        const distance = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(quote.distanceMeters / 1000);
        return [`${deliveryConfirmed ? "O frete expirou e foi recalculado.\n\n" : ""}🚚 *Confira sua entrega*\n${quote.address}\nPercurso: ${distance} km • Frete: ${fmt(quote.feeCents)}\nTotal estimado com entrega: *${fmt(subtotal + quote.feeCents)}*\n\nResponda *CONFIRMAR ENTREGA* para enviar o pedido, ou escreva o que deseja alterar. Frete válido por 15 minutos.`];
      }
    }
  } catch (err) {
    s.pendingDelivery = undefined;
    const e = err as Error & { status?: number };
    return [e.status && [409, 422, 429, 503].includes(e.status)
      ? `Não consegui calcular o frete: ${e.message}`
      : "Não foi possível calcular o frete agora. Tente novamente em instantes; seu pedido ainda não foi enviado."];
  }

  let order;
  try {
    order = await createOrder({
      customerName: s.customer.name,
      customerPhone: s.customer.phone,
      deliveryAddress: s.customer.address,
      deliveryQuoteId,
      items: s.cart.map((i) => ({ productId: i.productId, qty: i.qty })),
      paymentMethod: s.paymentMethod,
      channel: "chat",
      brand: s.brand ?? "barbacue",
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    // 422 from the order endpoint carries a user-facing reason (closed/unavailable).
    if (e.status === 422) { s.pendingDelivery = undefined; return [`Não consegui finalizar: ${e.message}`]; }
    if (e.status && e.status < 500) return [`Não consegui registrar o pedido: ${e.message}`];
    // The server may have committed before the response was lost. Never retry
    // that cart without a durable idempotency contract on the legacy endpoint.
    s.orderOutcomeUnknown = true;
    s.pendingDelivery = undefined;
    console.error("[conversation] order outcome unknown");
    return [UNCERTAIN_ORDER];
  }

  // Order placed — clear the cart but keep the customer for the next order.
  const placedTotal = order.totalCents;
  s.cart = [];
  s.messages = [];
  s.pendingDelivery = undefined;

  const lines: string[] = [];
  lines.push(
    `✅ Pedido confirmado! Total: ${fmt(placedTotal)} • Pagamento: ${PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}`,
  );
  if (order.deliveryFeeCents) lines.push(`Frete incluído: ${fmt(order.deliveryFeeCents)}`);

  // Always offer the web (and app) link to track / pay. Use the PUBLIC url so
  // the customer can actually open it (webBaseUrl may be Docker-internal).
  const webLink = `${config.publicSiteUrl}/confirmation?id=${encodeURIComponent(order.orderId)}`;
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
