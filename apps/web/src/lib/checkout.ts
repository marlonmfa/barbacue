import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PaymentMethod } from "@/db/schema";

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
  couponCode: string | null;
  paymentMethod: PaymentMethod;
  /** "Troco para" amount in cents (cash only). null = no change needed. */
  changeForCents: number | null;

  set: (patch: Partial<Omit<CheckoutState, "set" | "reset" | "applyAgentPatch">>) => void;
  reset: () => void;
}

const initial = {
  name: "",
  phone: "",
  address: "",
  notes: "",
  couponCode: null as string | null,
  paymentMethod: "pix" as PaymentMethod,
  changeForCents: null as number | null,
};

export const useCheckout = create<CheckoutState>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => set(patch),
      reset: () => set(initial),
    }),
    { name: "barbacue-checkout" }
  )
);

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro na entrega",
  card_on_delivery: "Cartão na entrega",
};
