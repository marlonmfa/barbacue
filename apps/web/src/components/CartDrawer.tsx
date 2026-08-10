"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart, formatPrice } from "@/lib/cart";

export function CartDrawer() {
  const { totalItems, totalCents } = useCart();
  // Gate on mount: the server renders nothing (empty cart), so reading persisted
  // cart state during the first client render would mismatch + flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const count = mounted ? totalItems() : 0;
  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto animate-slide-up">
        <Link
          href="/cart"
          className="flex items-center justify-between bg-[var(--brand-red)] hover:bg-[var(--brand-red-hover)] text-white rounded-2xl shadow-xl shadow-black/40 px-5 py-4 transition-colors active:scale-[0.98]"
        >
          <span className="bg-[var(--brand-tan)] text-[#2a1a0a] font-bold text-sm rounded-full w-7 h-7 flex items-center justify-center">
            {count}
          </span>
          <span className="font-semibold text-sm">Ver carrinho</span>
          <span className="font-bold">{formatPrice(totalCents())}</span>
        </Link>
      </div>
    </div>
  );
}
