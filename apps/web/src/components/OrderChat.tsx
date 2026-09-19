"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BRANDS, type Brand } from "@/lib/brands";
import { useCart, formatPrice, type CartItem } from "@/lib/cart";
import { useCheckout } from "@/lib/checkout";
import type { PaymentMethod } from "@/db/schema";
import { BrandNavigation } from "./BrandNavigation";
import { ChatAudio } from "./ChatAudio";

interface Flow {
  messages: { role: "user" | "assistant"; content: string }[];
  cart: CartItem[];
  customer: { name?: string; phone?: string; address?: string; notes?: string };
  paymentMethod: PaymentMethod;
  couponCode: string | null;
}
const empty = (): Flow => ({ messages: [], cart: [], customer: {}, paymentMethod: "pix", couponCode: null });

export function OrderChat({ brand }: { brand: Brand }) {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow>(empty);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const key = `atendimento:${brand}:v1`;
  /* Hydrate the restaurant draft after SSR, when sessionStorage is available. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.messages) && Array.isArray(parsed.cart) && parsed.customer) setFlow(parsed);
      }
    } catch { /* Storage is optional. */ }
    setReady(true);
  }, [key]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => { if (ready) { try { sessionStorage.setItem(key, JSON.stringify(flow)); } catch { /* Storage is optional. */ } } }, [flow, ready, key]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [flow.messages, busy]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || lock.current || !ready) return;
    const text = input.trim();
    lock.current = true; setBusy(true); setError("");
    try {
      const messages = [...flow.messages, { role: "user" as const, content: text }];
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...flow, messages, brand }), signal: AbortSignal.timeout(60_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui responder agora.");
      setFlow({ messages: [...messages, { role: "assistant", content: data.reply }], cart: data.cart, customer: data.customer, paymentMethod: data.paymentMethod, couponCode: data.couponCode });
      setInput("");
    } catch (error) { setError(error instanceof Error ? error.message : "Tente enviar novamente."); }
    finally { lock.current = false; setBusy(false); }
  }

  function review() {
    useCart.getState().replace(flow.cart.map((item) => ({ ...item, imageUrl: item.imageUrl ?? null })));
    useCheckout.getState().reset();
    useCheckout.getState().set({ ...flow.customer, paymentMethod: flow.paymentMethod, couponCode: flow.couponCode });
    router.push(`/payment?brand=${brand}&from=chat`);
  }

  return <>
    <BrandNavigation active={brand} chat />
    <main className="w-full max-w-3xl mx-auto p-4 flex flex-col gap-4">
      <header><h1 className="text-2xl font-bold">Atendimento {BRANDS[brand]}</h1><p className="text-sm text-[var(--text-muted)]">Escreva ou envie um áudio. Seu pedido fica separado por restaurante.</p></header>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden" aria-label={`Conversa com ${BRANDS[brand]}`}>
        <div role="log" aria-live="polite" className="h-[42vh] min-h-64 overflow-y-auto p-4 flex flex-col gap-3">
          <p className="self-start rounded-xl bg-[var(--surface-2)] p-3">Olá! Sou o atendente {BRANDS[brand]}. O que você gostaria de pedir?</p>
          {flow.messages.map((message, index) => <p key={index} className={`max-w-[90%] rounded-xl p-3 whitespace-pre-wrap ${message.role === "user" ? "self-end bg-[var(--brand-red)] text-white" : "self-start bg-[var(--surface-2)]"}`}>{message.content}</p>)}
          {busy && <p role="status">Anotando seu pedido…</p>}<div ref={end} />
        </div>
        <ChatAudio disabled={busy || !ready} onText={(text) => setInput((current) => [current, text].filter(Boolean).join(" "))} />
        <form onSubmit={send} className="flex gap-2 p-3 border-t border-[var(--border)]">
          <textarea aria-label="Seu pedido" rows={2} className="flex-1 min-w-0 rounded-xl border border-[var(--border)] p-3" value={input} onChange={(event) => setInput(event.target.value)} disabled={busy || !ready} placeholder="Escreva seu pedido…" />
          <button disabled={busy || !ready || !input.trim()} className="rounded-xl bg-[var(--brand-red)] text-white px-4 disabled:opacity-40">Enviar</button>
        </form>
        {error && <p role="alert" className="p-3 text-red-700">{error} Seu texto foi mantido para tentar novamente.</p>}
      </section>
      {flow.cart.length > 0 && <section className="rounded-2xl border border-[var(--border)] p-4">
        <h2 className="font-bold">Seu pedido · {BRANDS[brand]}</h2>
        <ul className="my-3">{flow.cart.map((item) => <li key={item.productId} className="flex justify-between gap-3 py-1"><span>{item.qty} × {item.name}</span><span>{formatPrice(item.priceCents * item.qty)}</span></li>)}</ul>
        <p className="font-semibold">Subtotal: {formatPrice(flow.cart.reduce((sum, item) => sum + item.priceCents * item.qty, 0))}</p>
        <p className="text-sm my-2">Frete e total serão conferidos na próxima etapa.</p>
        {flow.customer.name && flow.customer.phone && flow.customer.address ? <button onClick={review} disabled={busy} className="rounded-xl bg-[var(--brand-red)] text-white px-4 py-3">Conferir e pagar</button> : <p className="text-sm">Informe nome, telefone com DDD e endereço na conversa para continuar.</p>}
      </section>}
    </main>
  </>;
}
