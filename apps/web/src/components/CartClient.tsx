"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCart, formatPrice } from "@/lib/cart";
import { useCheckout } from "@/lib/checkout";
import type { CustomerPrefill } from "@/lib/customer-session";

interface CouponResult {
  id: number; code: string; description: string | null;
  discountType: string; discountValue: number; discountCents: number;
}

export function CartClient({ prefill }: { prefill?: CustomerPrefill | null }) {
  const router = useRouter();
  const { items, setQty, remove, totalCents } = useCart();
  const setCheckout = useCheckout((s) => s.set);

  const [name, setName] = useState(prefill?.name ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [address, setAddress] = useState(prefill?.address ?? "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const subtotal = totalCents();
  const discount = coupon?.discountCents ?? 0;
  const total = Math.max(0, subtotal - discount);

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-[var(--text-muted)] px-4">
        <span className="text-6xl">🛒</span>
        <p className="text-lg font-medium">Seu carrinho está vazio</p>
        <Link href="/" className="bg-[var(--brand-red)] text-white px-6 py-2.5 rounded-full font-semibold hover:bg-[var(--brand-red-hover)] transition-colors">
          Ver cardápio
        </Link>
      </div>
    );
  }

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setCouponError(null);
    setCouponLoading(true);
    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponInput.trim(), subtotalCents: subtotal }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCoupon(null);
      setCouponError(data.error ?? "Cupom inválido");
    } else {
      setCoupon(data);
    }
    setCouponLoading(false);
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponInput("");
    setCouponError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2 || phone.trim().length < 8) {
      setError("Informe seu nome e telefone para continuar.");
      return;
    }
    setLoading(true);
    // Persist customer data into the shared checkout store, then advance to
    // the unified /payment page (the same destination the AI agent uses).
    setCheckout({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      notes: notes.trim(),
      couponCode: coupon?.code ?? null,
    });
    router.push("/payment");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="bg-[var(--brand-red)] text-white px-4 py-4 flex items-center gap-3">
        <Link href="/" className="text-white/80 hover:text-white">← Voltar</Link>
        <h1 className="font-bold text-lg">Seu pedido</h1>
        {prefill && (
          <span className="ml-auto text-xs bg-black/20 px-2.5 py-1 rounded-full">
            👤 {prefill.name}
          </span>
        )}
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Items */}
        <section className="bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
          {items.map((item) => (
            <div key={item.productId} className="flex items-center gap-3 p-4 border-b border-[var(--border)] last:border-0">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-[var(--surface-2)] flex-shrink-0">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.name} fill className="object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">🍔</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.name}</p>
                <p className="text-[var(--brand-tan)] text-sm font-semibold">{formatPrice(item.priceCents)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setQty(item.productId, item.qty - 1)}
                  className="w-7 h-7 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] font-bold flex items-center justify-center hover:bg-[var(--border)]">−</button>
                <span className="w-5 text-center text-sm font-semibold">{item.qty}</span>
                <button onClick={() => setQty(item.productId, item.qty + 1)}
                  className="w-7 h-7 rounded-full bg-[var(--brand-red)] text-white font-bold flex items-center justify-center hover:bg-[var(--brand-red-hover)]">+</button>
              </div>
            </div>
          ))}

          <div className="px-4 py-3 bg-[var(--bg)] flex flex-col gap-1">
            <div className="flex justify-between text-sm text-[var(--text-muted)]">
              <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-400 font-medium">
                <span>Desconto ({coupon?.code})</span><span>−{formatPrice(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-[var(--text)] pt-1 border-t border-[var(--border)] mt-1">
              <span>Total</span><span className="text-[var(--brand-tan)]">{formatPrice(total)}</span>
            </div>
          </div>
        </section>

        {/* Coupon */}
        <section className="bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--border)] p-5">
          <h2 className="font-bold text-[var(--text)] mb-3">Cupom de desconto</h2>
          {coupon ? (
            <div className="flex items-center justify-between bg-green-950/40 border border-green-800/50 rounded-xl px-4 py-3">
              <div>
                <p className="font-semibold text-green-300 text-sm">{coupon.code}</p>
                {coupon.description && <p className="text-green-400 text-xs">{coupon.description}</p>}
                <p className="text-green-400 text-xs font-medium">−{formatPrice(coupon.discountCents)} aplicado</p>
              </div>
              <button onClick={removeCoupon} className="text-green-400 hover:text-green-200 text-sm font-medium">Remover</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyCoupon())}
                placeholder="CÓDIGO"
                className="flex-1 border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[var(--brand-red)]"
              />
              <button onClick={applyCoupon} disabled={couponLoading || !couponInput.trim()}
                className="bg-[var(--brand-red)] hover:bg-[var(--brand-red-hover)] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
                {couponLoading ? "..." : "Aplicar"}
              </button>
            </div>
          )}
          {couponError && <p className="text-red-500 text-xs mt-2">{couponError}</p>}
        </section>

        {/* Checkout form */}
        <form onSubmit={handleSubmit} className="bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--border)] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[var(--text)]">Seus dados</h2>
            {prefill && (
              <span className="text-xs text-[var(--brand-tan)] bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                Pré-preenchido
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-muted)]" htmlFor="name">Nome *</label>
            <input id="name" type="text" required value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Seu nome"
              className="border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-red)]" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-muted)]" htmlFor="phone">Telefone / WhatsApp *</label>
            <input id="phone" type="tel" required value={phone}
              onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999"
              className="border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-red)]" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-muted)]" htmlFor="address">Endereço de entrega</label>
            <input id="address" type="text" value={address}
              onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro"
              className="border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-red)]" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-muted)]" htmlFor="notes">Observações</label>
            <textarea id="notes" rows={3} value={notes}
              onChange={(e) => setNotes(e.target.value)} placeholder="Sem cebola, sem maionese..."
              className="border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-red)] resize-none" />
          </div>

          {error && <p className="text-red-500 text-sm bg-red-950/40 rounded-xl px-4 py-2.5">{error}</p>}

          <button type="submit" disabled={loading}
            className="bg-[var(--brand-red)] hover:bg-[var(--brand-red-hover)] disabled:opacity-50 text-white font-semibold py-3 rounded-2xl transition-colors text-sm">
            {loading ? "Indo para pagamento..." : `Ir para pagamento · ${formatPrice(total)}`}
          </button>
        </form>
      </div>
    </div>
  );
}
