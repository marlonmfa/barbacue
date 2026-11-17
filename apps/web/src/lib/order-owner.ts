// Quem é o dono do pedido, para o título do cartão no painel. Pedidos do salão
// e de balcão do Anota AI chegam sem cliente ("Cliente Anota AI"): nesses casos
// o título passa a ser a mesa (com o garçom) ou a retirada com o número externo.

const GENERIC_NAMES = new Set(["cliente anota ai", "cliente ifood", "cliente", "não identificado", "nao identificado"]);

export interface OwnerInput {
  customerName: string | null;
  tableNumber: number | null;
  orderType: "delivery" | "dine_in" | "pickup";
  notes: string | null;
  id: string;
}

export function orderOwner(order: OwnerInput): { title: string; detail: string | null } {
  const name = order.customerName?.trim() ?? "";
  const notes = order.notes ?? "";
  const waiter = notes.match(/Garçom:\s*([^\n·|]+)/)?.[1]?.trim() ?? null;
  if (name && !GENERIC_NAMES.has(name.toLocaleLowerCase("pt-BR"))) return { title: name, detail: null };
  const table = order.tableNumber ? `Mesa ${order.tableNumber}` : notes.match(/Mesa:\s*([^\n·|]+)/)?.[1]?.trim() ?? null;
  if (table) return { title: /^mesa\b/i.test(table) ? table : `Mesa ${table}`, detail: waiter ? `Garçom: ${waiter}` : null };
  const ref = notes.match(/Anota AI #(\w+)/)?.[1] ?? null;
  const label = order.orderType === "pickup" ? "Retirada no balcão" : order.orderType === "dine_in" ? "Consumo no local" : "Entrega";
  return { title: ref ? `${label} #${ref}` : `${label} #${order.id.slice(0, 8).toUpperCase()}`, detail: waiter ? `Garçom: ${waiter}` : null };
}

/** Cores fixas das tags: a mesma origem e o mesmo restaurante têm sempre a mesma cor. */
export const ORIGIN_TAG: Record<string, { label: string; bg: string; fg: string }> = {
  anotaai: { label: "Anota AI", bg: "#6d28d9", fg: "#ffffff" },
  ifood: { label: "iFood", bg: "#ea1d2c", fg: "#ffffff" },
  chat: { label: "WhatsApp", bg: "#128c4a", fg: "#ffffff" },
  click: { label: "Site / app", bg: "#2563eb", fg: "#ffffff" },
  online: { label: "Site / Pix", bg: "#2563eb", fg: "#ffffff" },
  kiosk: { label: "Totem", bg: "#475569", fg: "#ffffff" },
  table_qr: { label: "QR da mesa", bg: "#475569", fg: "#ffffff" },
  test: { label: "Teste", bg: "#047857", fg: "#ffffff" },
  other: { label: "Outra origem", bg: "#6b7280", fg: "#ffffff" },
};

export const BRAND_TAG = {
  barbacue: { label: "Barbacue", bg: "#ed1b24", fg: "#ffffff" },
  chelas: { label: "Chelas", bg: "#f4c93d", fg: "#3b0a10" },
  barbadog: { label: "Barbadog", bg: "#182448", fg: "#ffd34e" },
} as const;

export function originTag(channel: string | null) {
  return ORIGIN_TAG[channel ?? "other"] ?? { ...ORIGIN_TAG.other, label: channel ?? ORIGIN_TAG.other.label };
}
