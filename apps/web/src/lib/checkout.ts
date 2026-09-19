import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PaymentMethod, OrderType } from "@/db/schema";
import type { CheckoutDeliveryQuote } from "./delivery-checkout";

/**
 * Checkout state shared by every ordering path: the manual cart form, the AI
 * agent, and the /payment page all read and write this single store. That's
 * what makes "clicking" and "typing" produce an identical order — the agent
 * fills the same fields a human would have typed.
 */
export interface CheckoutState {
  name: string;
  phone: string;
  address: string;
  notes: string;
  /** Transient: never restore a stale route/fee from localStorage. */
  deliveryQuote: CheckoutDeliveryQuote | null;
  couponCode: string | null;
  paymentMethod: PaymentMethod;
  /** "Troco para" amount in cents (cash only). null = no change needed. */
  changeForCents: number | null;

  // ─── Dine-in (mesa) ───
  /** "delivery" (needs address) or "dine_in" (tied to a table, no address). */
  orderType: OrderType;
  /** When seated via QR, the table the order is tied to. null = delivery. */
  tableToken: string | null;
  tableNumber: number | null;

  set: (patch: Partial<Omit<CheckoutState, "set" | "reset" | "applyAgentPatch">>) => void;
  reset: () => void;
}

const initial = {
  name: "",
  phone: "",
  address: "",
  notes: "",
  deliveryQuote: null as CheckoutDeliveryQuote | null,
  couponCode: null as string | null,
  paymentMethod: "pix" as PaymentMethod,
  changeForCents: null as number | null,
  orderType: "delivery" as OrderType,
  tableToken: null as string | null,
  tableNumber: null as number | null,
};

export const useCheckout = create<CheckoutState>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => set((state) => ({
        ...patch,
        // Address or fulfillment changes revoke the quote synchronously, even
        // when edits come from the cart or the conversational assistant.
        ...((patch.address !== undefined && patch.address !== state.address) ||
          (patch.orderType !== undefined && patch.orderType !== state.orderType)
          ? { deliveryQuote: null } : {}),
      })),
      reset: () => set(initial),
    }),
    {
      name: "barbacue-checkout",
      partialize: (state) => ({ ...state, deliveryQuote: null }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<CheckoutState>), deliveryQuote: null }),
    }
  )
);

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro na entrega",
  card_on_delivery: "Cartão na entrega",
};
