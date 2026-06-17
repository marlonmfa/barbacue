import { NextRequest } from "next/server";
import OpenAI from "openai";
import { db } from "@/db";
import { categories, products, storeSettings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

interface AgentItem {
  productId: number;
  name: string;
  priceCents: number;
  qty: number;
}

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

// Always show the #id of each line so the model never guesses a productId when
// it wants to keep/modify an item already in the cart.
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
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const history = (body.messages ?? []).slice(-20);
  if (history.length === 0) {
    return Response.json({ error: "Mensagem vazia" }, { status: 400 });
  }

  // ─── Load the live menu so the agent can never invent products/prices ───
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const prods = await db
    .select()
    .from(products)
    .where(eq(products.available, true))
    .orderBy(asc(products.sortOrder));

  const byId = new Map(prods.map((p) => [p.id, p]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const menuText = prods
    .map((p) => `#${p.id} | ${p.name} | ${fmt(p.priceCents)} | ${catName.get(p.categoryId ?? -1) ?? "Outros"}`)
    .join("\n");

  const storeName = settings?.storeName ?? "Barbacue";
  const isClosed = settings?.isOpen === false;

  // Working copies the tools mutate; returned to the client as the new truth.
  let cart: AgentItem[] = (body.cart ?? []).filter((i) => byId.has(i.productId));
  const customer = { ...(body.customer ?? {}) };
  let paymentMethod = body.paymentMethod ?? "pix";
  let navigate = false;

  const openai = new OpenAI({ apiKey });

  const system = `Você é o atendente virtual da hamburgueria "${storeName}". Atende em português brasileiro, de forma calorosa, breve e objetiva — como um atendente de WhatsApp.

Seu trabalho: anotar o pedido do cliente conversando e, quando ele estiver pronto, levá-lo direto para a página de pagamento usando a ferramenta go_to_payment. O cliente pode misturar livremente clicar no cardápio e escrever — os dois valem igual.

Regras:
- Use SOMENTE itens do cardápio abaixo, pelo #id exato. Nunca invente produtos ou preços.
- Ao adicionar/remover itens use as ferramentas (add_item, set_quantity, remove_item). Não diga que adicionou sem chamar a ferramenta.
- NUNCA mexa em itens que já estão no carrinho se o cliente não pediu. Para adicionar um novo item use add_item; não use set_quantity para "manter" itens existentes.
- Adicione apenas o que o cliente pediu explicitamente — nunca itens extras por conta própria.
- Sugira combinações e pergunte bebida/acompanhamento quando fizer sentido, sem ser insistente.
- Antes de ir para o pagamento, garanta que você tem: nome e telefone do cliente, e o endereço (se for entrega). Use set_customer para salvar esses dados conforme o cliente fala.
- Pergunte a forma de pagamento (Pix, dinheiro na entrega, ou cartão na entrega) e use set_payment_method.
- Quando o pedido estiver completo e os dados preenchidos, confirme um resumo curto e chame go_to_payment.
- Valores sempre em reais (R$).
${isClosed ? "- ATENÇÃO: a loja está FECHADA agora. Avise o cliente que o pedido só será preparado na reabertura.\n" : ""}
CARDÁPIO (#id | nome | preço | categoria):
${menuText}

Estado atual do pedido: ${cartSummary(cart)}
Cliente: ${customer.name ? `${customer.name}` : "(sem nome)"}${customer.phone ? ` / ${customer.phone}` : ""}${customer.address ? ` / ${customer.address}` : ""}`;

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
          "Leva o cliente para a página de pagamento. Só chame com itens no carrinho e nome+telefone preenchidos.",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  function runTool(name: string, args: Record<string, unknown>): string {
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
        cart = cart.filter((i) => i.productId !== p.id);
        if (qty > 0) cart.push({ productId: p.id, name: p.name, priceCents: p.priceCents, qty });
        return JSON.stringify({ ok: true, cart: cartSummary(cart) });
      }
      case "remove_item": {
        cart = cart.filter((i) => i.productId !== Number(args.productId));
        return JSON.stringify({ ok: true, cart: cartSummary(cart) });
      }
      case "set_customer": {
        if (typeof args.name === "string" && args.name.trim()) customer.name = args.name.trim();
        if (typeof args.phone === "string" && args.phone.trim()) customer.phone = args.phone.trim();
        if (typeof args.address === "string" && args.address.trim()) customer.address = args.address.trim();
        if (typeof args.notes === "string") customer.notes = args.notes.trim();
        return JSON.stringify({ ok: true, customer });
      }
      case "set_payment_method": {
        const m = String(args.method);
        if (["pix", "cash", "card_on_delivery"].includes(m)) paymentMethod = m;
        return JSON.stringify({ ok: true, paymentMethod });
      }
      case "go_to_payment": {
        if (cart.length === 0) return JSON.stringify({ error: "Carrinho vazio — não dá para pagar." });
        if (!customer.name || !customer.phone)
          return JSON.stringify({ error: "Faltam nome e/ou telefone do cliente." });
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
        const result = runTool(call.function.name, parsed);
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
  } catch (err) {
    console.error("chat agent error", err);
    return Response.json(
      { error: "Não consegui processar agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }

  if (!reply) reply = "Certo! Mais alguma coisa?";

  return Response.json({
    reply,
    cart,
    customer,
    paymentMethod,
    navigate,
  });
}
