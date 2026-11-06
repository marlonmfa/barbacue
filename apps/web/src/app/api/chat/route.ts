import { isBrand } from "@/lib/brands";
import { NextRequest } from "next/server";
import OpenAI from "openai";
import { db } from "@/db";
import {
  categories,
  products,
  storeSettings,
  customers,
  orders,
  closedDays,
  coupons,
  restaurantTables,
  brandCatalogProducts,
} from "@/db/schema";
import { and, eq, asc, desc, gte } from "drizzle-orm";
import { effectivePrice, isPromoActive } from "@/lib/pricing";
import { computeStoreStatus } from "@/lib/store-hours";
import { safeEqual } from "@/lib/admin-auth";
import { ensureBrandCatalogs } from "@/lib/managed-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

interface AgentItem {
  productId: number;
  name: string;
  priceCents: number;
  qty: number;
}

interface AgentProduct {
  id: number;
  name: string;
  description: string | null;
  category: string;
  priceCents: number;
  originalPriceCents: number | null;
}

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const cartSummary = (cart: AgentItem[]) => {
  if (cart.length === 0) return "Carrinho vazio.";
  const total = cart.reduce((s, i) => s + i.priceCents * i.qty, 0);
  return (
    cart.map((i) => `#${i.productId} ${i.name} x${i.qty} (${fmt(i.priceCents * i.qty)})`).join("; ") +
    ` — Total: ${fmt(total)}`
  );
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI indisponível (sem chave configurada)." }, { status: 503 });
  }

  let body: {
    messages?: { role: "user" | "assistant"; content: string }[];
    cart?: AgentItem[];
    customer?: { name?: string; phone?: string; address?: string; notes?: string };
    paymentMethod?: string;
    couponCode?: string | null;
    customerPhone?: string;
    // When seated via QR, the dining table's opaque token (dine-in mode).
    tableToken?: string;
    brand?: "barbacue" | "barbadog" | "chelas";
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.brand !== undefined && !isBrand(body.brand)) return Response.json({ error: "Restaurante inválido." }, { status: 400 });
  if (!Array.isArray(body.messages) || body.messages.some((message) => !message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || message.content.length > 8000) || (body.cart !== undefined && !Array.isArray(body.cart))) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const history = (body.messages ?? []).slice(-20);
  if (history.length === 0) {
    return Response.json({ error: "Mensagem vazia" }, { status: 400 });
  }

  // ─── Identity: ONLY a token-authenticated bot may load saved customer data ───
  // The WhatsApp bot has verified the sender's number; a public web caller has
  // not, so we must never read a stranger's address/order history from a phone
  // they merely typed (IDOR). isBot gates all cross-customer reads.
  const botToken = process.env.BOT_API_TOKEN;
  const isBot = Boolean(botToken) && safeEqual(req.headers.get("x-bot-token") ?? "", botToken!);

  // ─── Load the live menu so the agent can never invent products/prices ───
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  const brand = body.brand ?? "barbacue";
  const brandName = brand === "barbadog" ? "Barbadog" : brand === "chelas" ? "Chelas" : settings?.storeName ?? "Barbacue";
  let prods: AgentProduct[] = [];
  if (brand === "barbacue") {
    const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
    const categoryName = new Map(cats.map((category) => [category.id, category.name]));
    const native = await db
      .select()
      .from(products)
      .where(eq(products.available, true))
      .orderBy(asc(products.sortOrder));
    prods = native.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: categoryName.get(product.categoryId ?? -1) ?? "Outros",
      priceCents: effectivePrice(product),
      originalPriceCents: isPromoActive(product) ? product.priceCents : null,
    }));
  } else {
    await ensureBrandCatalogs();
    const managed = await db
      .select()
      .from(brandCatalogProducts)
      .where(and(eq(brandCatalogProducts.brand, brand), eq(brandCatalogProducts.available, true)))
      .orderBy(asc(brandCatalogProducts.sortOrder));
    prods = managed.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      priceCents: product.priceCents,
      originalPriceCents: product.originalPriceCents,
    }));
  }

  // Short-circuit an empty catalog instead of letting the agent loop on
  // "Produto não encontrado".
  if (prods.length === 0) {
    return Response.json({
      reply: "Nosso cardápio está indisponível no momento. Tente novamente em instantes! 🙏",
      cart: [],
      customer: body.customer ?? {},
      paymentMethod: body.paymentMethod ?? "pix",
      couponCode: null,
      orderType: "delivery",
      tableNumber: null,
      brand,
      navigate: false,
    });
  }

  const byId = new Map(prods.map((p) => [p.id, p]));
  const menuText = prods
    .map((p) => {
      const desc = p.description ? ` — ${p.description}` : "";
      if (p.originalPriceCents && p.originalPriceCents > p.priceCents) {
        return `#${p.id} | ${p.name} | ${fmt(p.priceCents)} (PROMO! de ${fmt(p.originalPriceCents)}) | ${p.category}${desc}`;
      }
      return `#${p.id} | ${p.name} | ${fmt(p.priceCents)} | ${p.category}${desc}`;
    })
    .join("\n");

  // ─── Schedule-aware closure (same source of truth as /api/orders) ───
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingClosed = await db
    .select({ date: closedDays.date, reason: closedDays.reason })
    .from(closedDays)
    .where(gte(closedDays.date, todayStr))
    .orderBy(asc(closedDays.date));
  const storeStatus = computeStoreStatus(settings, upcomingClosed);

  // ─── Dine-in (mesa) resolution ───
  let tableNumber: number | null = null;
  let validTableToken: string | null = null;
  if (body.tableToken) {
    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.token, body.tableToken));
    if (table && table.active) {
      tableNumber = table.number;
      validTableToken = table.token;
    }
  }
  const isDineIn = validTableToken !== null;

  // Working copies the tools mutate; returned to the client as the new truth.
  let cart: AgentItem[] = (body.cart ?? []).filter((i) => i && byId.has(i.productId) && Number.isSafeInteger(i.qty) && i.qty > 0 && i.qty <= 99).map((i) => {
    const product = byId.get(i.productId)!;
    return { productId: product.id, name: product.name, priceCents: product.priceCents, qty: i.qty };
  });
  const customer = { ...(body.customer ?? {}) };
  let paymentMethod = body.paymentMethod ?? "pix";
  let couponCode: string | null = body.couponCode ?? null;
  let couponDiscount = 0;
  let navigate = false;

  // ─── Known customer ("logged in") — bot-verified phone ONLY ──────────
  const knownPhone = isBot ? (body.customerPhone || customer.phone || "").trim() : "";
  if (isBot && body.customerPhone) customer.phone = knownPhone;

  let historyText = "";
  const lastOrderItems: { productId: number; qty: number }[] = [];

  if (knownPhone) {
    const [record] = await db.select().from(customers).where(eq(customers.phone, knownPhone));
    if (record) {
      if (!customer.name) customer.name = record.name;
      if (!customer.address && record.address) customer.address = record.address;
    }
    const past = await db
      .select({ items: orders.items, createdAt: orders.createdAt, totalCents: orders.totalCents })
      .from(orders)
      .where(and(eq(orders.customerPhone, knownPhone), eq(orders.brand, brand)))
      .orderBy(desc(orders.createdAt))
      .limit(3);

    if (past.length > 0) {
      const summarize = (items: unknown): string => {
        const arr = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
        return arr
          .map((it) => {
            const id = Number(it.productId ?? it.product_id);
            const p = byId.get(id);
            const name = p?.name ?? String(it.name ?? "item");
            return `${it.qty}x ${name}`;
          })
          .join(", ");
      };
      historyText = past.map((o, idx) => `Pedido ${idx + 1}: ${summarize(o.items)}`).join("\n");

      const recent = Array.isArray(past[0].items) ? (past[0].items as Record<string, unknown>[]) : [];
      for (const it of recent) {
        const id = Number(it.productId ?? it.product_id);
        const qty = Math.max(1, Number(it.qty) || 1);
        if (byId.has(id)) lastOrderItems.push({ productId: id, qty });
      }
    }
  }

  const openai = new OpenAI({ apiKey });

  const system = `Você é o atendente virtual do restaurante "${brandName}". Atende em português brasileiro, de forma calorosa, breve e objetiva — como um atendente de WhatsApp.

Seu trabalho: anotar o pedido do cliente conversando e, quando ele estiver pronto, levá-lo direto para a página de pagamento usando a ferramenta go_to_payment. O cliente pode misturar livremente clicar no cardápio e escrever — os dois valem igual.

Regras:
- Use SOMENTE itens do cardápio abaixo, pelo #id exato. Nunca invente produtos ou preços.
- Ao adicionar/remover itens use as ferramentas (add_item, set_quantity, remove_item). Não diga que adicionou sem chamar a ferramenta.
- NUNCA mexa em itens que já estão no carrinho se o cliente não pediu. Para adicionar um novo item use add_item; não use set_quantity para "manter" itens existentes.
- Adicione apenas o que o cliente pediu explicitamente — nunca itens extras por conta própria.
- Para responder dúvidas sobre os lanches use APENAS a descrição do cardápio. Se a informação (ingrediente, alérgeno) não estiver lá, diga que vai confirmar com a cozinha — NUNCA invente ingredientes.
- Se o cliente tiver um cupom de desconto, use apply_coupon para validar e aplicar. Só confirme o desconto depois que a ferramenta retornar sucesso.
- Sugira combinações e pergunte bebida/acompanhamento quando fizer sentido, sem ser insistente.
- Pergunte a forma de pagamento (Pix, dinheiro, ou cartão) e use set_payment_method.
- Valores sempre em reais (R$).
${
  isDineIn
    ? `- ATENDIMENTO NA MESA: o cliente está na MESA ${tableNumber}, consumo NO LOCAL. NÃO peça endereço de entrega. Antes do pagamento garanta apenas o NOME e o TELEFONE do cliente, depois chame go_to_payment.`
    : `- ENTREGA: antes de ir para o pagamento, garanta que você tem nome, telefone E endereço de entrega do cliente. Use set_customer para salvar esses dados conforme o cliente fala.`
}
${
  !storeStatus.open
    ? `- ATENÇÃO: a loja está FECHADA agora (${storeStatus.reason}${storeStatus.nextOpen ? " " + storeStatus.nextOpen : ""}). Avise o cliente logo no começo que NÃO é possível finalizar o pedido agora e ofereça anotar para a reabertura. NÃO chame go_to_payment enquanto fechada.\n`
    : ""
}
CARDÁPIO (#id | nome | preço | categoria — descrição):
${menuText}

Estado atual do pedido: ${cartSummary(cart)}
${couponCode ? `Cupom aplicado: ${couponCode}\n` : ""}Cliente: ${customer.name ? `${customer.name}` : "(sem nome)"}${customer.phone ? ` / ${customer.phone}` : ""}${customer.address && !isDineIn ? ` / ${customer.address}` : ""}
${historyText ? `\nPEDIDOS ANTERIORES deste cliente (mais recente primeiro):\n${historyText}\n- Se o cliente quiser repetir um pedido anterior, use a ferramenta repeat_last_order.\n` : ""}`;

  type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
  const messages: Msg[] = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content }) as Msg),
  ];

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "add_item",
        description: "Adiciona N unidades de um produto ao carrinho (soma à quantidade atual).",
        parameters: {
          type: "object",
          properties: {
            productId: { type: "integer", description: "O #id exato do produto no cardápio" },
            qty: { type: "integer", minimum: 1, default: 1 },
          },
          required: ["productId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "set_quantity",
        description: "Define a quantidade exata de um produto (0 remove).",
        parameters: {
          type: "object",
          properties: {
            productId: { type: "integer" },
            qty: { type: "integer", minimum: 0 },
          },
          required: ["productId", "qty"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "remove_item",
        description: "Remove totalmente um produto do carrinho.",
        parameters: {
          type: "object",
          properties: { productId: { type: "integer" } },
          required: ["productId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "set_customer",
        description: "Salva dados do cliente (preencha apenas o que souber).",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            phone: { type: "string" },
            address: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "apply_coupon",
        description: "Valida e aplica um cupom de desconto pelo código. Retorna o desconto ou um erro.",
        parameters: {
          type: "object",
          properties: { code: { type: "string", description: "Código do cupom" } },
          required: ["code"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "set_payment_method",
        description: "Define a forma de pagamento.",
        parameters: {
          type: "object",
          properties: { method: { type: "string", enum: ["pix", "cash", "card_on_delivery"] } },
          required: ["method"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "go_to_payment",
        description:
          "Leva o cliente para a página de pagamento. Só chame com itens no carrinho, nome e telefone preenchidos, e a loja aberta.",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  if (lastOrderItems.length > 0) {
    tools.push({
      type: "function",
      function: {
        name: "repeat_last_order",
        description:
          "Recarrega o último pedido do cliente no carrinho (substitui o carrinho atual). Itens indisponíveis são ignorados e preços são atualizados.",
        parameters: { type: "object", properties: {} },
      },
    });
  }

  // Basic BR phone sanity: 10–11 digits after stripping non-digits.
  const phoneOk = (p?: string) => {
    const digits = (p ?? "").replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 13;
  };

  async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case "add_item": {
        const p = byId.get(Number(args.productId));
        if (!p) return JSON.stringify({ error: "Produto não encontrado", cart: cartSummary(cart) });
        const qty = Math.max(1, Number(args.qty) || 1);
        const existing = cart.find((i) => i.productId === p.id);
        if (existing) existing.qty += qty;
        else cart.push({ productId: p.id, name: p.name, priceCents: p.priceCents, qty });
        return JSON.stringify({ ok: true, added: `${qty}x ${p.name}`, cart: cartSummary(cart) });
      }
      case "set_quantity": {
        const p = byId.get(Number(args.productId));
        if (!p) return JSON.stringify({ error: "Produto não encontrado", cart: cartSummary(cart) });
        const qty = Math.max(0, Number(args.qty) || 0);
        const existing = cart.find((i) => i.productId === p.id);
        if (qty === 0) {
          cart = cart.filter((i) => i.productId !== p.id);
        } else if (existing) {
          existing.qty = qty; // mutate in place → stable cart order
        } else {
          cart.push({ productId: p.id, name: p.name, priceCents: p.priceCents, qty });
        }
        return JSON.stringify({ ok: true, cart: cartSummary(cart) });
      }
      case "remove_item": {
        cart = cart.filter((i) => i.productId !== Number(args.productId));
        return JSON.stringify({ ok: true, cart: cartSummary(cart) });
      }
      case "set_customer": {
        if (typeof args.name === "string" && args.name.trim()) customer.name = args.name.trim();
        if (typeof args.phone === "string" && args.phone.trim()) customer.phone = args.phone.trim();
        if (!isDineIn && typeof args.address === "string" && args.address.trim())
          customer.address = args.address.trim();
        if (typeof args.notes === "string") customer.notes = args.notes.trim();
        return JSON.stringify({ ok: true, customer });
      }
      case "apply_coupon": {
        const code = String(args.code ?? "").toUpperCase().trim();
        if (!code) return JSON.stringify({ error: "Informe o código do cupom." });
        const subtotal = cart.reduce((s, i) => s + i.priceCents * i.qty, 0);
        const [c] = await db.select().from(coupons).where(eq(coupons.code, code));
        if (!c || !c.active) return JSON.stringify({ error: "Cupom inválido." });
        if (c.expiresAt && new Date(c.expiresAt) < new Date())
          return JSON.stringify({ error: "Cupom expirado." });
        if (c.maxUsages !== null && (c.usedCount ?? 0) >= c.maxUsages)
          return JSON.stringify({ error: "Cupom esgotado." });
        if ((c.minOrderCents ?? 0) > 0 && subtotal < (c.minOrderCents ?? 0))
          return JSON.stringify({ error: `Pedido mínimo para o cupom: ${fmt(c.minOrderCents ?? 0)}.` });
        couponDiscount =
          c.discountType === "percentage"
            ? Math.round(subtotal * (c.discountValue / 100))
            : c.discountValue;
        couponDiscount = Math.min(Math.max(couponDiscount, 0), subtotal);
        couponCode = c.code;
        return JSON.stringify({ ok: true, code: c.code, discount: fmt(couponDiscount) });
      }
      case "set_payment_method": {
        const m = String(args.method);
        if (["pix", "cash", "card_on_delivery"].includes(m)) paymentMethod = m;
        return JSON.stringify({ ok: true, paymentMethod });
      }
      case "repeat_last_order": {
        if (lastOrderItems.length === 0)
          return JSON.stringify({ error: "Sem pedido anterior para repetir." });
        cart = [];
        for (const it of lastOrderItems) {
          const p = byId.get(it.productId);
          if (p) cart.push({ productId: p.id, name: p.name, priceCents: p.priceCents, qty: it.qty });
        }
        return JSON.stringify({ ok: true, repeated: true, cart: cartSummary(cart) });
      }
      case "go_to_payment": {
        if (!storeStatus.open)
          return JSON.stringify({ error: `Loja fechada. ${storeStatus.reason}` });
        if (cart.length === 0) return JSON.stringify({ error: "Carrinho vazio — não dá para pagar." });
        if (!customer.name) return JSON.stringify({ error: "Falta o nome do cliente." });
        if (!phoneOk(customer.phone))
          return JSON.stringify({ error: "Falta um telefone válido (com DDD)." });
        navigate = true;
        return JSON.stringify({ ok: true, navigating: true, cart: cartSummary(cart) });
      }
      default:
        return JSON.stringify({ error: "Ferramenta desconhecida" });
    }
  }

  // ─── Agentic loop: keep resolving tool calls until the model replies in text ───
  let reply = "";
  try {
    for (let step = 0; step < 6; step++) {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        temperature: 0.3,
      });
      const msg = completion.choices[0].message;
      messages.push(msg);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        reply = msg.content ?? "";
        break;
      }

      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* tolerate malformed args */
        }
        const result = await runTool(call.function.name, parsed);
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
  } catch (err) {
    console.error("chat agent error", err);
    return Response.json(
      { error: "Não consegui processar agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  if (!reply) reply = "Certo! Mais alguma coisa?";

  return Response.json({
    reply,
    cart,
    customer,
    paymentMethod,
    couponCode,
    orderType: isDineIn ? "dine_in" : "delivery",
    tableNumber,
    brand,
    navigate,
  });
}
