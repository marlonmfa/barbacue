import type { Brand } from "./brands";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  productId: number;
  brand?: Brand;
  notes?: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  qty: number;
}

interface CartStore {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">) => void;
  remove: (productId: number, brand?: Brand) => void;
  setQty: (productId: number, qty: number, brand?: Brand) => void;
  /** Replace the whole cart — used by the AI agent to sync its resulting cart. */
  replace: (items: CartItem[]) => void;
  clear: () => void;
  totalCents: () => number;
  totalItems: () => number;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        const existing = get().items.find((i) => i.productId === item.productId && (i.brand ?? "barbacue") === (item.brand ?? "barbacue"));
        if (existing) {
          set((s) => ({
            items: s.items.map((i) =>
              i.productId === item.productId && (i.brand ?? "barbacue") === (item.brand ?? "barbacue") ? { ...i, qty: i.qty + 1 } : i
            ),
          }));
        } else {
          set((s) => ({ items: [...s.items, { ...item, qty: 1 }] }));
        }
      },
      remove: (productId, brand = "barbacue") =>
        set((s) => ({ items: s.items.filter((i) => (i.productId !== productId || (i.brand ?? "barbacue") !== brand)) })),
      setQty: (productId, qty, brand = "barbacue") => {
        if (qty <= 0) {
          get().remove(productId, brand);
        } else {
          set((s) => ({
            items: s.items.map((i) =>
              i.productId === productId && (i.brand ?? "barbacue") === brand ? { ...i, qty } : i
            ),
          }));
        }
      },
      replace: (items) => set({ items }),
      clear: () => set({ items: [] }),
      totalCents: () =>
        get().items.reduce((sum, i) => sum + i.priceCents * i.qty, 0),
      totalItems: () => get().items.reduce((sum, i) => sum + i.qty, 0),
    }),
    { name: "barbacue-cart" }
  )
);

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
