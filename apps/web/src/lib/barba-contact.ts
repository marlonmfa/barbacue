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
  canAssignManagement: boolean;
};

export function barbaContactPhone(value: string): string | null {
  const match = /^(\+?[\d(). -]+)(@(?:s\.whatsapp\.net|c\.us))?$/.exec(value.trim());
  if (!match) return null;
  const digits = match[1].replace(/\D/g, "");
  const international = match[1].startsWith("+") || match[2];
  const phone = international && !digits.startsWith("55")
    ? (/^[1-9]\d{6,14}$/.test(digits) ? digits : null)
    : canonicalPhone(digits);
  // WhatsApp also uses legacy Brazilian mobile JIDs with eight local digits.
  return phone && /^55\d{2}[6-9]\d{7}$/.test(phone) ? phone.slice(0, 4) + "9" + phone.slice(4) : phone;
}

export function barbaOrderPhoneKeys(phone: string): string[] {
  return /^55\d{2}9[6-9]\d{7}$/.test(phone) ? [phone, phone.slice(0, 4) + phone.slice(5)] : [phone];
}
