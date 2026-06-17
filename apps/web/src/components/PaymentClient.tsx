"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { useCart, formatPrice } from "@/lib/cart";
import { useCheckout, PAYMENT_LABELS } from "@/lib/checkout";
import type { CustomerPrefill } from "@/lib/customer-session";
import type { PaymentMethod } from "@/db/schema";

interface OrderResponse {
  orderId: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  pix: { payload: string } | null;
}

const METHODS: { value: PaymentMethod; icon: string; hint: string }[] = [
  { value: "pix", icon: "⚡", hint: "Pague na hora pelo QR Code ou copia e cola" },
  { value: "cash", icon: "💵", hint: "Pague em dinheiro quando o pedido chegar" },
  { value: "card_on_delivery", icon: "💳", hint: "Maquininha de cartão na entrega" },
];

export function PaymentClient({ prefill }: { prefill?: CustomerPrefill | null }) {
  const router = useRouter();
  const { items, totalCents, clear } = useCart();
  const checkout = useCheckout();

  const [hydrated, setHydrated] = useState(false);
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Zustand+persist hydrates after mount; gate rendering to avoid SSR mismatch.
  useEffect(() => setHydrated(true), []);

  // Seed missing customer fields from the server prefill cookie (once).
  useEffect(() => {
    if (!prefill) return;
    const patch: Record<string, string> = {};
    if (!checkout.name && prefill.name) patch.name = prefill.name;
    if (!checkout.phone && prefill.phone) patch.phone = prefill.phone;
    if (!checkout.address && prefill.address) patch.address = prefill.address;
    if (Object.keys(patch).length) checkout.set(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Re-validate any coupon the customer carried over from the cart.
  useEffect(() => {
    const subtotal = totalCents();
    if (!checkout.couponCode || subtotal === 0) {
      setCoupon(null);
      return;
    }
    let cancelled = false;
    fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: checkout.couponCode, subtotalCents: subtotal }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setCoupon(d ? { code: d.code, discountCents: d.discountCents } : null))
      .catch(() => !cancelled && setCoupon(null));
    return () => {
      cancelled = true;
    };
  }, [checkout.couponCode, items, totalCents]);

  // Build the QR image whenever a Pix payload comes back.
  useEffect(() => {
    if (!order?.pix) return;
    QRCode.toDataURL(order.pix.payload, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [order]);

  if (!hydrated) return null;

  const subtotal = totalCents();
  const discount = coupon?.discountCents ?? 0;
  const total = Math.max(0, subtotal - discount);

  // ─── Success state: order created ───
  if (order) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <header className="bg-green-600 text-white px-4 py-4">
          <h1 className="font-bold text-lg max-w-2xl mx-auto">Pedido recebido! 🎉</h1>
        </header>
        <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center gap-6 text-center">
          <p className="text-xs text-[var(--text-muted)] font-mono bg-[var(--surface-2)] px-3 py-1.5 rounded-lg">
            #{order.orderId.slice(0, 8).toUpperCase()}
          </p>

          {order.pix ? (
            <div className="w-full bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--border)] p-6 flex flex-col items-center gap-4">
              <p className="font-bold text-[var(--text)]">Pague {formatPrice(order.totalCents)} com Pix</p>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR Code Pix" className="w-56 h-56 rounded-xl" />
              ) : (
                <div className="w-56 h-56 rounded-xl bg-[var(--surface-2)] animate-pulse" />
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(order.pix!.payload);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="w-full bg-[var(--brand-red)] hover:bg-[var(--brand-red-hover)] text-white font-semibold py-3 rounded-2xl transition-colors text-sm"
              >
                {copied ? "✓ Código copiado!" : "📋 Copiar código Pix (copia e cola)"}
              </button>
              <p className="text-xs text-[var(--text-muted)] break-all bg-[var(--bg)] rounded-lg px-3 py-2 font-mono leading-relaxed">
                {order.pix.payload}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Após o pagamento, enviaremos a confirmação pelo WhatsApp.
              </p>
            </div>
          ) : (
            <div className="w-full bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--border)] p-6">
              <p className="text-4xl mb-3">{order.paymentMethod === "cash" ? "💵" : "💳"}</p>
              <p className="font-semibold text-[var(--text)]">
                Pagamento na entrega · {PAYMENT_LABELS[order.paymentMethod]}
              </p>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Total a pagar: <span className="font-bold text-[var(--brand-tan)]">{formatPrice(order.totalCents)}</span>
              </p>
            </div>
          )}

          <Link
            href="/"
            className="text-[var(--brand-tan)] hover:text-[var(--brand-tan-soft)] font-semibold text-sm"
          >
            ← Voltar ao cardápio
          </Link>
        </div>
      </div>
    );
  }

  // ─── Empty cart guard ───
  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-[var(--text-muted)] px-4">
        <span className="text-6xl">🛒</span>
        <p className="text-lg font-medium">Nada para pagar ainda</p>
        <Link href="/" className="bg-[var(--brand-red)] text-white px-6 py-2.5 rounded-full font-semibold hover:bg-[var(--brand-red-hover)]">
          Ver cardápio
        </Link>
      </div>
    );
  }

  async function placeOrder() {
    if (!checkout.name.trim() || checkout.phone.trim().length < 8) {
      setError("Preencha nome e telefone na etapa anterior.");
      return;
    }
    setError(null);
    setLoading(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: checkout.name,
        customerPhone: checkout.phone,
        deliveryAddress: checkout.address || undefined,
        notes: checkout.notes || undefined,
        couponCode: coupon?.code,
        paymentMethod: checkout.paymentMethod,
        changeForCents:
          checkout.paymentMethod === "cash" && checkout.changeForCents
            ? checkout.changeForCents
            : undefined,
        channel: "click",
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          priceCents: i.priceCents,
          qty: i.qty,
        })),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ? JSON.stringify(data.error) : "Erro ao enviar pedido");
      setLoading(false);
      return;
    }

    const data: OrderResponse = await res.json();
    clear();
    checkout.set({ couponCode: null });
    setOrder(data);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="bg-[var(--brand-red)] text-white px-4 py-4 flex items-center gap-3">
        <Link href="/cart" className="text-white/80 hover:text-white">← Voltar</Link>
        <h1 className="font-bold text-lg">Pagamento</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Recap */}
        <section className="bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--border)] p-5">
          <h2 className="font-bold text-[var(--text)] mb-3">Resumo</h2>
          {items.map((i) => (
            <div key={i.productId} className="flex justify-between text-sm py-1 text-[var(--text-muted)]">
              <span>{i.qty}× {i.name}</span>
              <span>{formatPrice(i.priceCents * i.qty)}</span>
            </div>
          ))}
          {discount > 0 && (
            <div className="flex justify-between text-sm py-1 text-green-400 font-medium">
              <span>Desconto ({coupon?.code})</span><span>−{formatPrice(discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg text-[var(--text)] pt-2 mt-2 border-t border-[var(--border)]">
            <span>Total</span><span className="text-[var(--brand-tan)]">{formatPrice(total)}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">
            Entrega para <span className="font-medium text-[var(--text-muted)]">{checkout.name || "—"}</span>
            {checkout.address ? ` · ${checkout.address}` : ""}
          </p>
        </section>

        {/* Payment method */}
        <section className="bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--border)] p-5">
          <h2 className="font-bold text-[var(--text)] mb-3">Forma de pagamento</h2>
          <div className="flex flex-col gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => checkout.set({ paymentMethod: m.value })}
                className={`flex items-center gap-3 text-left rounded-xl border px-4 py-3 transition-colors ${
                  checkout.paymentMethod === m.value
                    ? "border-[var(--brand-red)] bg-[#ed1b24]/10 ring-1 ring-[var(--brand-red)]"
                    : "border-[var(--border)] hover:border-[var(--border-hover)]"
                }`}
              >
                <span className="text-2xl">{m.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-[var(--text)]">{PAYMENT_LABELS[m.value]}</p>
                  <p className="text-xs text-[var(--text-muted)]">{m.hint}</p>
                </div>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                    checkout.paymentMethod === m.value ? "border-[var(--brand-red)] bg-[var(--brand-red)]" : "border-[var(--border-hover)]"
                  }`}
                />
              </button>
            ))}
          </div>

          {checkout.paymentMethod === "cash" && (
            <div className="mt-4 flex flex-col gap-1">
              <label className="text-sm font-medium text-[var(--text-muted)]">Troco para quanto? (opcional)</label>
              <input
                type="number"
                inputMode="decimal"
                placeholder="Ex: 50"
                defaultValue={checkout.changeForCents ? checkout.changeForCents / 100 : ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  checkout.set({ changeForCents: isNaN(v) ? null : Math.round(v * 100) });
                }}
                className="border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-red)]"
              />
            </div>
          )}
        </section>

        {error && <p className="text-red-500 text-sm bg-red-950/40 rounded-xl px-4 py-2.5">{error}</p>}

        <button
          onClick={placeOrder}
          disabled={loading}
          className="bg-[var(--brand-red)] hover:bg-[var(--brand-red-hover)] disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl transition-colors text-sm"
        >
          {loading
            ? "Enviando..."
            : checkout.paymentMethod === "pix"
            ? `Gerar Pix · ${formatPrice(total)}`
            : `Confirmar pedido · ${formatPrice(total)}`}
        </button>
      </div>
    </div>
  );
}
