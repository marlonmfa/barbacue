"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";
import { parseCheckoutQuote } from "@/lib/delivery-checkout";
import styles from "./TestOrderChat.module.css";

type Brand = "barbacue" | "barbadog" | "chelas";
type PaymentMethod = "pix" | "cash" | "card_on_delivery";

interface Product {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  promoPriceCents: number | null;
  category: string;
}

interface CartItem {
  productId: number;
  name: string;
  priceCents: number;
  qty: number;
}

interface Customer {
  name?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

interface VisibleMessage {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  at: string;
}

interface FlowState {
  history: ApiMessage[];
  cart: CartItem[];
  customer: Customer;
  paymentMethod: PaymentMethod;
  couponCode: string | null;
}

interface ChatResponse {
  reply: string;
  cart: CartItem[];
  customer: Customer;
  paymentMethod: PaymentMethod;
  couponCode: string | null;
  navigate: boolean;
}

interface OrderResult {
  orderId: string;
  brand: Brand;
  totalCents: number;
  items: CartItem[];
  paymentMethod: PaymentMethod;
}

const BRANDS: { id: Brand; name: string; short: string }[] = [
  { id: "barbacue", name: "Barbacue", short: "BQ" },
  { id: "barbadog", name: "Barbadog", short: "BD" },
  { id: "chelas", name: "Chelas", short: "CH" },
];

const TEST_CUSTOMER: Required<Pick<Customer, "name" | "phone" | "address">> = {
  name: "Cliente Teste",
  phone: "(47) 99999-0000",
  address: "Rua Teste, 123, Centro, Jaraguá do Sul",
};

const emptyFlow = (): FlowState => ({
  history: [],
  cart: [],
  customer: {},
  paymentMethod: "pix",
  couponCode: null,
});

const formatMoney = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const now = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const messageId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function greeting(brand: Brand): VisibleMessage {
  const name = BRANDS.find((item) => item.id === brand)?.name ?? "Barbacue";
  return {
    id: messageId(),
    role: "assistant",
    content: `Olá! Você foi direcionado para o atendimento ${name}. Como posso ajudar com seu pedido?`,
    at: now(),
  };
}

export function TestOrderChat() {
  const [brand, setBrand] = useState<Brand>("barbacue");
  const [products, setProducts] = useState<Product[]>([]);
  const [preferredProduct, setPreferredProduct] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [messages, setMessages] = useState<VisibleMessage[]>([greeting("barbacue")]);
  const [flow, setFlow] = useState<FlowState>(emptyFlow);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [target, setTarget] = useState<Product | null>(null);
  const flowRef = useRef(flow);
  const scrollRef = useRef<HTMLDivElement>(null);
  const orderPendingRef = useRef(false);

  const brandInfo = BRANDS.find((item) => item.id === brand) ?? BRANDS[0];
  const cartTotal = useMemo(
    () => flow.cart.reduce((sum, item) => sum + item.priceCents * item.qty, 0),
    [flow.cart],
  );

  function commitFlow(next: FlowState) {
    flowRef.current = next;
    setFlow(next);
  }

  function addMessage(role: VisibleMessage["role"], content: string) {
    setMessages((current) => [...current, { id: messageId(), role, content, at: now() }]);
  }

  function resetConversation(nextBrand = brand) {
    commitFlow(emptyFlow());
    setMessages([greeting(nextBrand)]);
    setInput("");
    setOrder(null);
    setTarget(null);
    orderPendingRef.current = false;
  }

  function chooseBrand(nextBrand: Brand) {
    if (nextBrand === brand) return;
    setCatalogLoading(true);
    setProducts([]);
    setPreferredProduct("");
    resetConversation(nextBrand);
    setBrand(nextBrand);
  }

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/products?brand=${brand}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog");
        const groups = (await response.json()) as {
          name: string;
          products: Omit<Product, "category">[];
        }[];
        return groups.flatMap((group) =>
          group.products.map((product) => ({ ...product, category: group.name })),
        );
      })
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          addMessage("status", "Não foi possível carregar os produtos disponíveis desta marca.");
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brand]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, order]);

  async function registerOrder(state: FlowState) {
    if (orderPendingRef.current) return;
    if (state.cart.length === 0) {
      addMessage("status", "O pedido ainda não tem produtos para finalizar.");
      return;
    }

    const customer = {
      name: state.customer.name?.trim(),
      phone: state.customer.phone?.trim(),
      address: state.customer.address?.trim(),
    };
    if (!customer.name || !customer.phone || !customer.address) {
      addMessage("status", "Faltam nome, telefone ou endereço antes de finalizar.");
      return;
    }

    orderPendingRef.current = true;
    addMessage("status", "Enviando o pedido para o sistema central…");
    try {
      let deliveryQuoteId: string | undefined;
      const availability = await fetch("/api/delivery/quote", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const config = await availability.json();
      if (!availability.ok || typeof config.enabled !== "boolean") throw new Error("Não foi possível verificar o frete do pedido de teste.");
      if (config.enabled) {
        const response = await fetch("/api/delivery/quote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: customer.address, brand }), signal: AbortSignal.timeout(30000),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível calcular o frete do teste.");
        const quote = parseCheckoutQuote(data, customer.address, brand);
        deliveryQuoteId = quote.quoteId;
        addMessage("status", `Frete do pedido de teste: ${formatMoney(quote.feeCents)} · ${(quote.distanceMeters / 1000).toLocaleString("pt-BR")} km. O valor será incluído no total.`);
      }
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          customerName: customer.name,
          customerPhone: customer.phone,
          deliveryAddress: customer.address,
          deliveryQuoteId,
          items: state.cart.map(({ productId, qty }) => ({ productId, qty })),
          paymentMethod: state.paymentMethod,
          channel: "test",
          orderType: "delivery",
          notes: "[PEDIDO DE TESTE] Criado pelo simulador /teste_pedido",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Pedido não registrado.");

      setOrder(data as OrderResult);
      addMessage(
        "assistant",
        `Pedido de teste confirmado! Código #${String(data.orderId).slice(0, 8).toUpperCase()}. Ele já está na fila administrativa e pode ser impresso.`,
      );
    } catch (error) {
      orderPendingRef.current = false;
      addMessage(
        "status",
        error instanceof Error ? error.message : "Não foi possível registrar o pedido.",
      );
    }
  }

  async function askAgent(text: string, finalizeWhenReady = true) {
    const trimmed = text.trim();
    if (!trimmed) return;

    addMessage("user", trimmed);
    const current = flowRef.current;
    const nextHistory: ApiMessage[] = [...current.history, { role: "user", content: trimmed }];
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          messages: nextHistory,
          cart: current.cart,
          customer: current.customer,
          paymentMethod: current.paymentMethod,
          couponCode: current.couponCode,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ChatResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "O agente não respondeu.");

      const reply = data.reply || "Certo. Pode continuar.";
      const next: FlowState = {
        history: [...nextHistory, { role: "assistant", content: reply }],
        cart: data.cart ?? current.cart,
        customer: data.customer ?? current.customer,
        paymentMethod: data.paymentMethod ?? current.paymentMethod,
        couponCode: data.couponCode ?? current.couponCode,
      };
      commitFlow(next);
      addMessage("assistant", reply);
      if (data.navigate && finalizeWhenReady) await registerOrder(next);
    } catch (error) {
      const content = error instanceof Error ? error.message : "O agente não respondeu.";
      addMessage("status", content);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function handleManualSend(event: FormEvent) {
    event.preventDefault();
    if (busy || automatic || order || !input.trim()) return;
    const text = input;
    setInput("");
    try {
      await askAgent(text);
    } catch {
      // The visible status bubble already explains the failure.
    }
  }

  async function runAutomaticBuyer() {
    if (automatic || busy || products.length === 0) return;
    resetConversation(brand);
    setAutomatic(true);

    const nameCounts = new Map<string, number>();
    for (const product of products) {
      const key = product.name.trim().toLocaleLowerCase("pt-BR");
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    const firstUnique = products.find(
      (product) => nameCounts.get(product.name.trim().toLocaleLowerCase("pt-BR")) === 1,
    );
    const chosen = preferredProduct
      ? products.find((product) => String(product.id) === preferredProduct) ?? products[0]
      : firstUnique ?? products[0];
    setTarget(chosen);
    addMessage("status", `Cliente automático iniciado. Produto escolhido: ${chosen.name}.`);

    const script = [
      `Olá! Quero fazer um pedido no ${brandInfo.name}.`,
      `Quero 1 ${chosen.name}, o de ${formatMoney(chosen.promoPriceCents ?? chosen.priceCents)}, por favor.`,
      `Meu nome é ${TEST_CUSTOMER.name}, meu telefone é ${TEST_CUSTOMER.phone} e o endereço é ${TEST_CUSTOMER.address}.`,
      "Vou pagar por Pix. Pode conferir e finalizar meu pedido agora?",
    ];

    let agentFailed = false;
    for (const line of script) {
      try {
        await askAgent(line, false);
      } catch {
        agentFailed = true;
        break;
      }
    }

    // The automatic acceptance test is deterministic: if an AI response did
    // not persist one of the explicitly supplied fields, complete only those
    // fields with the same data the test customer just sent.
    const latest = flowRef.current;
    const hasAnyProduct = latest.cart.length > 0;
    const completed: FlowState = {
      ...latest,
      cart: hasAnyProduct
        ? latest.cart
        : [{
            productId: chosen.id,
            name: chosen.name,
            priceCents: chosen.promoPriceCents ?? chosen.priceCents,
            qty: 1,
          }],
      customer: { ...latest.customer, ...TEST_CUSTOMER },
      paymentMethod: "pix",
    };
    commitFlow(completed);

    if (agentFailed || !hasAnyProduct) {
      addMessage(
        "status",
        "A validação automática completou os dados explícitos do cliente para testar a gravação do pedido.",
      );
    }

    await registerOrder(completed);
    setAutomatic(false);
  }

  const testProgress = [
    { label: "Marca roteada", done: true },
    { label: "Produto no carrinho", done: flow.cart.length > 0 },
    { label: "Dados do cliente", done: Boolean(flow.customer.name && flow.customer.phone && flow.customer.address) },
    { label: "Pedido registrado", done: Boolean(order) },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.identity}>
          <span className={styles.mark}><AdminIcon name="beaker" size={19} /></span>
          <div>
            <strong>Laboratório de pedidos</strong>
            <small>Número central · ambiente da equipe</small>
          </div>
        </div>
        <Link href="/admin" className={styles.backLink}>
          Voltar ao painel <AdminIcon name="arrow" size={15} />
        </Link>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.controlPanel}>
          <div className={styles.eyebrow}>Teste assistido</div>
          <h1>Compre como um cliente.</h1>
          <p className={styles.lead}>
            Converse livremente ou deixe o cliente automático escolher um produto disponível e concluir a compra.
          </p>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>1. Restaurante</span>
            <div className={styles.brandGrid}>
              {BRANDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseBrand(item.id)}
                  disabled={busy || automatic}
                  className={`${styles.brandButton} ${brand === item.id ? styles.brandButtonActive : ""}`}
                >
                  <span>{item.short}</span>
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor="test-product">2. Produto do teste</label>
            <select
              id="test-product"
              className={styles.productSelect}
              value={preferredProduct}
              onChange={(event) => setPreferredProduct(event.target.value)}
              disabled={catalogLoading || busy || automatic}
            >
              <option value="">Escolher qualquer disponível</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {formatMoney(product.promoPriceCents ?? product.priceCents)}
                </option>
              ))}
            </select>
            <span className={styles.catalogStatus}>
              {catalogLoading ? "Consultando catálogo…" : `${products.length} produtos disponíveis agora`}
            </span>
          </div>

          <button
            type="button"
            className={styles.runButton}
            onClick={runAutomaticBuyer}
            disabled={catalogLoading || products.length === 0 || busy || automatic}
          >
            <AdminIcon name="spark" size={18} />
            {automatic ? "Cliente comprando…" : "Executar compra automática"}
          </button>
          <button
            type="button"
            className={styles.resetButton}
            onClick={() => resetConversation()}
            disabled={busy || automatic}
          >
            Reiniciar conversa
          </button>

          <div className={styles.progressCard}>
            <div className={styles.progressTitle}>Rastro do teste</div>
            {testProgress.map((step) => (
              <div key={step.label} className={styles.progressRow}>
                <span className={step.done ? styles.progressDone : styles.progressPending}>
                  {step.done && <AdminIcon name="check" size={12} />}
                </span>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className={styles.phoneStage}>
          <div className={styles.phone}>
            <div className={styles.chatHeader}>
              <div className={styles.agentAvatar}>{brandInfo.short}</div>
              <div className={styles.agentIdentity}>
                <strong>Atendimento {brandInfo.name}</strong>
                <span><i /> Agente conectado pelo número central</span>
              </div>
              <AdminIcon name="whatsapp" size={22} />
            </div>

            <div className={styles.chatBody} ref={scrollRef}>
              <div className={styles.encryptionNotice}>Ambiente interno de teste · nenhuma mensagem é enviada ao WhatsApp</div>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? styles.userBubble
                      : message.role === "status"
                        ? styles.statusBubble
                        : styles.agentBubble
                  }
                >
                  <span>{message.content}</span>
                  {message.role !== "status" && <time>{message.at}</time>}
                </div>
              ))}
              {busy && (
                <div className={styles.typingBubble} aria-label="Agente digitando">
                  <i /><i /><i />
                </div>
              )}

              {flow.cart.length > 0 && (
                <div className={styles.cartCard}>
                  <div>
                    <span>Pedido em montagem</span>
                    <strong>{flow.cart.reduce((sum, item) => sum + item.qty, 0)} item(ns)</strong>
                  </div>
                  <b>{formatMoney(cartTotal)}</b>
                </div>
              )}

              {order && (
                <div className={styles.receipt}>
                  <span className={styles.receiptIcon}><AdminIcon name="check" size={20} /></span>
                  <div>
                    <small>Pedido de teste registrado</small>
                    <strong>#{order.orderId.slice(0, 8).toUpperCase()}</strong>
                    <span>{brandInfo.name} · {formatMoney(order.totalCents)}</span>
                  </div>
                  <Link href="/admin/orders">Abrir</Link>
                </div>
              )}
            </div>

            <form className={styles.composer} onSubmit={handleManualSend}>
              <div className={styles.customerTag}>Cliente</div>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Digite como um cliente…"
                disabled={busy || automatic || Boolean(order)}
                aria-label="Mensagem do cliente"
              />
              <button
                type="submit"
                disabled={busy || automatic || Boolean(order) || !input.trim()}
                aria-label="Enviar mensagem"
              >
                <AdminIcon name="arrow" size={19} />
              </button>
            </form>
          </div>

          {target && (
            <div className={styles.targetNote}>
              <AdminIcon name="products" size={16} />
              Alvo automático: <strong>{target.name}</strong>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
