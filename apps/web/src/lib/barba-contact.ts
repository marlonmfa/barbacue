import { canonicalPhone } from "./input-format";

export const CONTACT_ROLES = ["admin", "manager", "driver", "customer"] as const;
export const CONTACT_ROLE_LABELS = {
  admin: "Administrador", manager: "Gerente", driver: "Entregador", customer: "Cliente",
};

export type BarbaContactProfile = {
  role: typeof CONTACT_ROLES[number] | null;
  source: "manual" | "staff" | "orders" | null;
  name: string | null;
  customer: { orderCount: number; lastOrderAt: string; brands: string[] } | null;
  canEdit: boolean;
};

export function barbaContactPhone(value: string): string | null {
  const match = /^(\+?[\d(). -]+)(?:@(?:s\.whatsapp\.net|c\.us))?$/.exec(value.trim());
  const phone = match ? canonicalPhone(match[1]) : null;
  // WhatsApp also uses legacy Brazilian mobile JIDs with eight local digits.
  return phone?.length === 12 && /^[6-9]/.test(phone.slice(4)) ? phone.slice(0, 4) + "9" + phone.slice(4) : phone;
}

export function barbaOrderPhoneKeys(phone: string): string[] {
  return /^55\d{2}9[6-9]\d{7}$/.test(phone) ? [phone, phone.slice(0, 4) + phone.slice(5)] : [phone];
}
