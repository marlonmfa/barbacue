import { createHash } from "node:crypto";

// Regras puras do gestor iFood. Sem rede e sem banco, para serem testáveis.
// O mapeamento de lojas espelha packages/ifood/src/merchants.ts (teste garante).

export type IfoodBrand = "barbacue" | "barbadog" | "chelas";
export interface IfoodStore { id: string; name: string; brand: IfoodBrand }

export const IFOOD_STORES: IfoodStore[] = [
  { id: "991532f5-0400-4efe-b38a-b2b37f8bd9b0", name: "Chelas", brand: "chelas" },
  { id: "403af0c6-176b-4021-a6cd-3e09dca09cbf", name: "Barbacue", brand: "barbacue" },
  { id: "6cb73c63-55cd-459b-a02b-aa936967bf20", name: "Hotdog", brand: "barbadog" },
];

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Mesmo mapeamento do monitor: IFOOD_MERCHANTS_JSON sobrescreve as três lojas padrão. */
export function loadIfoodStores(env: Record<string, string | undefined> = process.env): IfoodStore[] {
  const raw = env.IFOOD_MERCHANTS_JSON?.trim();
  const stores: IfoodStore[] = raw ? JSON.parse(raw) : IFOOD_STORES.map(s => ({ ...s }));
  if (!Array.isArray(stores) || !stores.length || stores.length > 100) throw new Error("Configure de 1 a 100 lojas iFood");
  const ids = new Set<string>();
  for (const s of stores) {
    if (!s || typeof s.id !== "string" || !UUID.test(s.id) || !["barbacue", "barbadog", "chelas"].includes(s.brand) || typeof s.name !== "string" || !s.name.trim() || ids.has(s.id)) {
      throw new Error("Mapeamento de lojas iFood inválido ou duplicado");
    }
    ids.add(s.id);
  }
  return stores;
}

/** Mesma identidade determinística usada pelo monitor (packages/ifood/src/order-store.ts). */
export function ifoodLocalId(externalId: string) {
  const hex = createHash("sha256").update(`ifood:${externalId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Recupera o ID do pedido no iFood a partir das observações gravadas pelo monitor.
 * Só aceita o valor se ele gerar exatamente o ID local do pedido, para que uma
 * observação editada nunca direcione uma ação a outro pedido.
 */
export function ifoodExternalId(localId: string, notes: string | null | undefined): string | null {
  const match = notes?.match(/^Pedido externo: ([\w-]{8,64})$/m);
  if (!match) return null;
  return ifoodLocalId(match[1]) === localId ? match[1] : null;
}

export function ifoodStoreFromNotes(notes: string | null | undefined, stores: IfoodStore[]): IfoodStore | null {
  const id = notes?.match(/^Loja iFood: ([\da-f-]{36})$/im)?.[1];
  return id ? stores.find(s => s.id.toLowerCase() === id.toLowerCase()) ?? null : null;
}

export const IFOOD_ACTIONS = ["confirm", "startPreparation", "readyToPickup", "dispatch", "cancel"] as const;
export type IfoodAction = typeof IFOOD_ACTIONS[number];

export const ACTION_LABELS: Record<IfoodAction, string> = {
  confirm: "Confirmar",
  startPreparation: "Iniciar preparo",
  readyToPickup: "Pronto para retirada",
  dispatch: "Saiu para entrega",
  cancel: "Cancelar",
};

/** Ações possíveis no iFood conforme a etapa local (espelho dos eventos PLC/CFM/PRS/RTP/DSP). */
export function allowedIfoodActions(status: string | null, orderType: string | null): IfoodAction[] {
  const finish: IfoodAction = orderType === "delivery" ? "dispatch" : "readyToPickup";
  switch (status) {
    case "pending": return ["confirm", "cancel"];
    case "confirmed": return ["startPreparation", finish, "cancel"];
    case "preparing": return [finish, "cancel"];
    // "ready" já representa RTP ou DSP no monitor; a conclusão vem do iFood (CON).
    default: return [];
  }
}

/** Data local (sem fuso) no formato ISO aceito pela API de interrupções; o iFood aplica o fuso da loja. */
export function storeLocalIso(date: Date, timeZone = "America/Sao_Paulo") {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
