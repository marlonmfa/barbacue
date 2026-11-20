import { cartLineKey, type MenuChoice } from "./menu-options";
import type { Brand } from "./brands";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  productId: number;
  brand?: Brand;
  notes?: string;
  choices?: MenuChoice[];
  name: string;
  priceCents: number;
  imageUrl: string | null;
  qty: number;
}

interface CartStore {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">) => void;
  setLineQty: (key: string, qty: number) => void;
  editLine: (key: string, item: CartItem) => void;
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
      add: (item) => set((state) => {
        const key = cartLineKey(item);
        const existing = state.items.find(line => cartLineKey(line) === key);
        return { items: existing
          ? state.items.map(line => line === existing ? { ...line, ...item, qty: line.qty + 1 } : line)
          : [...state.items, { ...item, qty: 1 }] };
      }),
      setLineQty: (key, qty) => set((state) => ({
        items: state.items.map(line => cartLineKey(line) === key ? { ...line, qty } : line).filter(line => line.qty > 0),
      })),
      editLine: (key, item) => set((state) => {
        const nextKey = cartLineKey(item);
        const match = state.items.find(line => cartLineKey(line) === nextKey && nextKey !== key);
        return { items: state.items.flatMap(line => {
          if (line === match) return [{ ...item, qty: line.qty + item.qty }];
          return cartLineKey(line) === key ? match ? [] : [item] : [line];
        }) };
      }),
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
