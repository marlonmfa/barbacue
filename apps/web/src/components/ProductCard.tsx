"use client";

import Image from "next/image";
import { useCart, formatPrice } from "@/lib/cart";
import type { Product } from "@/db/schema";

interface Props {
  product: Product;
}

export function ProductCard({ product }: Props) {
  const { add, items, setQty, remove } = useCart();
  const cartItem = items.find((i) => i.productId === product.id);

  function handleAdd() {
    add({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      imageUrl: product.imageUrl ?? null,
    });
  }

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden flex flex-col hover:border-[var(--brand-red)] transition-colors">
      <div className="relative w-full h-44 bg-[var(--surface-2)]">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 320px"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-[var(--border-hover)]">
            🍔
          </div>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1 gap-1.5">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2 text-[var(--text)]">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-xs text-[var(--text-muted)] line-clamp-2">
            {product.description}
          </p>
        )}

        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="font-bold text-sm text-[var(--brand-tan)]">
            {formatPrice(product.priceCents)}
          </span>

          {cartItem ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty(cartItem.productId, cartItem.qty - 1)}
                className="w-7 h-7 rounded-full border border-[var(--border-hover)] text-[var(--text)] font-bold flex items-center justify-center hover:border-[var(--brand-red)] transition-colors"
              >
                −
              </button>
              <span className="w-5 text-center text-sm font-semibold text-[var(--text)]">
                {cartItem.qty}
              </span>
              <button
                onClick={handleAdd}
                className="w-7 h-7 rounded-full bg-[var(--brand-red)] text-white font-bold flex items-center justify-center hover:bg-[var(--brand-red-hover)] transition-colors"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              className="bg-[var(--brand-red)] hover:bg-[var(--brand-red-hover)] text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-colors"
            >
              Adicionar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
