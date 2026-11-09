// Formatos e validações puras do iFood, usados no servidor e nas telas (sem rede).

export interface CatalogItem { id: string; name: string; status: string; priceCents: number | null; originalPriceCents: number | null; externalCode: string | null }
export interface CatalogCategory { id: string; name: string; status: string; items: CatalogItem[] }

const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null);

export function normalizeCatalog(raw: unknown): CatalogCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: Record<string, unknown>) => ({
    id: String(c.id ?? ""), name: String(c.name ?? "Categoria"), status: String(c.status ?? "AVAILABLE"),
    items: (Array.isArray(c.items) ? c.items : []).map((i: Record<string, unknown>) => {
      const price = (i.price ?? {}) as Record<string, unknown>;
      return {
        id: String(i.id ?? ""), name: String(i.name ?? (i.product as Record<string, unknown> | undefined)?.name ?? "Item"),
        status: String(i.status ?? "AVAILABLE"), priceCents: cents(price.value), originalPriceCents: cents(price.originalValue),
        externalCode: typeof i.externalCode === "string" ? i.externalCode : null,
      };
    }).filter(i => i.id),
  })).filter(c => c.id);
}

export const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type Day = typeof DAYS[number];
export interface Shift { dayOfWeek: Day; start: string; duration: number }

/** Valida turnos: início HH:mm(:ss), duração em minutos (1 a 1440), no máximo 10 por dia. */
export function validateShifts(shifts: Shift[]) {
  const perDay = new Map<string, number>();
  for (const s of shifts) {
    if (!DAYS.includes(s.dayOfWeek)) throw new Error("Dia da semana inválido.");
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s.start)) throw new Error("Use o início no formato HH:mm.");
    if (!Number.isInteger(s.duration) || s.duration < 1 || s.duration > 1440) throw new Error("Duração deve ficar entre 1 minuto e 24 horas.");
    perDay.set(s.dayOfWeek, (perDay.get(s.dayOfWeek) ?? 0) + 1);
  }
  if ([...perDay.values()].some(n => n > 10)) throw new Error("No máximo 10 turnos por dia.");
  return shifts.map(s => ({ ...s, start: s.start.length === 5 ? `${s.start}:00` : s.start }));
}

