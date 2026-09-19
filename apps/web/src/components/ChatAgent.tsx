"use client";

import { ChatAudio } from "./ChatAudio";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart, formatPrice, type CartItem } from "@/lib/cart";
import { useCheckout } from "@/lib/checkout";
import { TABLE_COOKIE } from "@/lib/table-session-shared";
import type { OrderType, PaymentMethod } from "@/db/schema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentItem {
  productId: number;
  name: string;
  priceCents: number;
  qty: number;
}

interface ChatResponse {
  reply: string;
  cart: AgentItem[];
  customer: { name?: string; phone?: string; address?: string; notes?: string };
  paymentMethod: PaymentMethod;
  couponCode: string | null;
  orderType: OrderType;
  tableNumber: number | null;
  navigate: boolean;
}

/** Read the (non-httpOnly) table-session cookie to pass the dine-in token to the
 * agent — so a seated guest's chat order is tied to their table. */
function readTableToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${TABLE_COOKIE}=`));
  if (!match) return null;
  try {
    const raw = decodeURIComponent(match.split("=").slice(1).join("="));
    const parsed = JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

const GREETING =
  "Oi! 👋 Sou o atendente do BARBACUE. Me diga o que você quer comer que eu já anoto o pedido — ou clique no cardápio, tanto faz! 🍔🔥";

const SUGGESTIONS = [
  "Quero um X-Burguer",
  "Qual o mais pedido?",
  "Montar um combo pra 2 pessoas",
];

export function ChatAgent() {
  const router = useRouter();
  const cartItems = useCart((s) => s.items);
  const replaceCart = useCart((s) => s.replace);
  const totalItems = useCart((s) => s.totalItems);
  const checkout = useCheckout();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Gate cart-derived UI (count, FAB position) until after hydration — the server
  // renders an empty cart, so reading the persisted store on first client render
  // would mismatch the FAB's `bottom-*` class and log a hydration error.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Only the conversation turns the model needs (skip the local greeting).
          messages: next.filter((m, i) => !(i === 0 && m.role === "assistant")),
          cart: cartItems.map((i) => ({
            productId: i.productId,
            name: i.name,
            priceCents: i.priceCents,
            qty: i.qty,
          })),
          customer: {
            name: checkout.name || undefined,
            phone: checkout.phone || undefined,
            address: checkout.address || undefined,
            notes: checkout.notes || undefined,
          },
          paymentMethod: checkout.paymentMethod,
          couponCode: checkout.couponCode || undefined,
          tableToken: readTableToken() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.error ?? "Ops, tive um problema. Pode repetir?" },
        ]);
        return;
      }

      const data: ChatResponse = await res.json();

      // Sync the agent's resulting state into the SAME stores the UI uses.
      // Preserve product images for items already in the cart.
      const imageById = new Map(cartItems.map((i) => [i.productId, i.imageUrl]));
      const merged: CartItem[] = data.cart.map((i) => ({
        productId: i.productId,
        name: i.name,
        priceCents: i.priceCents,
        qty: i.qty,
        imageUrl: imageById.get(i.productId) ?? null,
      }));
      replaceCart(merged);

      checkout.set({
        name: data.customer.name ?? checkout.name,
        phone: data.customer.phone ?? checkout.phone,
        address: data.customer.address ?? checkout.address,
        notes: data.customer.notes ?? checkout.notes,
        paymentMethod: data.paymentMethod,
        couponCode: data.couponCode ?? checkout.couponCode,
        orderType: data.orderType ?? checkout.orderType,
        tableNumber: data.tableNumber ?? checkout.tableNumber,
      });

      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);

      if (data.navigate) {
        setTimeout(() => router.push("/payment"), 600);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sem conexão agora. Tente de novo num instante." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const count = mounted ? totalItems() : 0;
  // Lift the FAB above the "Ver carrinho" bar when it's visible.
  const fabBottom = count > 0 ? "bottom-24" : "bottom-6";

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed right-4 ${fabBottom} z-50 flex items-center gap-2 bg-gradient-to-br from-[var(--brand-red)] to-[#a30f15] text-white pl-4 pr-5 py-3.5 rounded-full shadow-xl shadow-[var(--brand-red)]/30 hover:scale-105 active:scale-95 transition-transform`}
          aria-label="Pedir pelo chat"
        >
          <span className="text-xl">💬</span>
          <span className="font-semibold text-sm">Pedir pelo chat</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end pointer-events-none">
          <div
            className="absolute inset-0 bg-black/30 pointer-events-auto sm:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="relative pointer-events-auto w-full sm:w-[400px] sm:mr-4 h-[85vh] sm:h-[600px] sm:max-h-[85vh] bg-[var(--surface)] border border-[var(--border)] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-br from-[var(--brand-red)] to-[#8f0f15] text-white px-5 py-4 flex items-center gap-3">
              <span className="text-2xl">🔥</span>
              <div className="flex-1">
                <p className="font-bold text-sm leading-tight">Atendente BARBACUE</p>
                <p className="text-white/70 text-xs">Anota seu pedido na conversa</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-xl" aria-label="Fechar">
                ✕
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-[var(--bg)]">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "self-end bg-[var(--brand-red)] text-white rounded-br-sm"
                      : "self-start bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="self-start bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl rounded-bl-sm px-4 py-3">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" />
                  </span>
                </div>
              )}

              {/* Suggestion chips — only before the first user turn */}
              {messages.length === 1 && !loading && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs bg-[var(--surface-2)] border border-[var(--brand-red)]/40 text-[var(--brand-tan)] px-3 py-1.5 rounded-full hover:border-[var(--brand-red)] hover:text-[var(--text)] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart strip */}
            {count > 0 && (
              <button
                onClick={() => router.push("/cart")}
                className="bg-[var(--brand-red)]/15 border-t border-[var(--brand-red)]/30 px-4 py-2.5 flex items-center justify-between text-sm text-[var(--brand-tan)]"
              >
                <span className="font-medium">🛒 {count} item(s) no carrinho</span>
                <span className="font-bold">{formatPrice(useCart.getState().totalCents())}</span>
              </button>
            )}

            <ChatAudio disabled={loading} onText={(text) => setInput((current) => [current, text].filter(Boolean).join(" "))} />

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 p-3 border-t border-[var(--border)] bg-[var(--surface)]"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escreva seu pedido..."
                disabled={loading}
                className="flex-1 bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-muted)] border border-[var(--border)] rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-red)] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-[var(--brand-red)] hover:bg-[var(--brand-red-hover)] disabled:opacity-40 text-white w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                aria-label="Enviar"
              >
                ➤
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
