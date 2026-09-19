"use client";

import { useSyncExternalStore } from "react";
import { useCart, formatPrice } from "@/lib/cart";
import { isPromoActive, effectivePrice } from "@/lib/pricing";
import { ProductImage } from "@/components/ProductImage";
import type { Product } from "@/db/schema";

interface Props {
  product: Product;
  /** Category context retained for callers; fallback photos must be product-specific. */
  categorySlug?: string | null;
  categoryName?: string | null;
  /** When the store is closed, ordering is disabled (badge shown instead). */
  isClosed?: boolean;
}

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ProductCard({ product, isClosed = false }: Props) {
  const { add, items, setQty } = useCart();
  // Gate cart-derived UI until after hydration so the server (empty cart) and the
  // first client render agree — otherwise the qty stepper pops in / flashes.
  const mounted = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);

  const cartItem = mounted ? items.find((i) => i.productId === product.id) : undefined;
  const onSale = isPromoActive(product);
  const price = effectivePrice(product);
  const illustrative = product.imageUrl?.startsWith("/menu/review-2026-09/");

  function handleAdd() {
    add({
      productId: product.id,
      name: product.name,
      priceCents: price,
      imageUrl: product.imageUrl ?? null,
    });
  }

  return (
    <div className="group bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden flex flex-col transition-all duration-200 hover:border-[var(--brand-red)] hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40">
      <div className="relative w-full aspect-[4/3] bg-[var(--surface-2)] overflow-hidden">
        {onSale && (
          <span className="absolute top-2.5 left-2.5 z-10 bg-[var(--brand-red)] text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-lg shadow-black/40">
            🔥 Promo
          </span>
        )}
        <div className="absolute inset-0">
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            sizes="(max-width: 640px) 100vw, 320px"
          />
        </div>
        {illustrative && (
          <span className="absolute bottom-1.5 right-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-stone-600">
            Imagem ilustrativa
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 gap-1.5">
        <h3 className="font-semibold text-[15px] leading-snug line-clamp-2 text-[var(--text)]">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">{product.description}</p>
        )}

        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <span className="flex flex-col leading-none">
            {onSale && (
              <span className="text-[11px] text-[var(--text-muted)] line-through">
                {formatPrice(product.priceCents)}
              </span>
            )}
            <span className={`font-bold text-lg ${onSale ? "text-[var(--brand-red)]" : "text-[var(--brand-tan)]"}`}>
              {formatPrice(price)}
            </span>
          </span>

          {isClosed ? (
            <span className="text-[11px] font-semibold text-[var(--text-muted)] border border-[var(--border)] rounded-full px-3 py-1.5">
              Loja fechada
            </span>
          ) : cartItem ? (
            <div className="flex items-center gap-2 animate-pop">
              <button
                onClick={() => setQty(cartItem.productId, cartItem.qty - 1)}
                aria-label={`Diminuir ${product.name}`}
                className="w-8 h-8 rounded-full border border-[var(--border-hover)] text-[var(--text)] font-bold flex items-center justify-center hover:border-[var(--brand-red)] active:scale-90 transition-all"
              >
                −
              </button>
              <span className="w-5 text-center text-sm font-semibold text-[var(--text)]" aria-live="polite">
                {cartItem.qty}
              </span>
              <button
                onClick={handleAdd}
                aria-label={`Aumentar ${product.name}`}
                className="w-8 h-8 rounded-full btn-brand font-bold flex items-center justify-center"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              className="btn-brand text-xs font-bold px-5 py-2.5 rounded-full"
            >
              Adicionar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
