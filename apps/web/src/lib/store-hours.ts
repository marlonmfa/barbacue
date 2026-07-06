import type { WeeklyHours, StoreSettings, ClosedDay } from "@/db/schema";

// Computes whether the store is open right now from a machine-readable weekly
// schedule + a closed-days calendar + a manual override, all in the store's
// timezone. No external date library — Intl handles timezone conversion.

export interface StoreStatus {
  open: boolean;
  reason: string;          // human-readable, pt-BR
  nextOpen: string | null; // best-effort "abre <dia> às HH:MM", or null
}

const DAY_LABEL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Local date parts in the given IANA timezone. */
function localParts(now: Date, tz: string): { dateStr: string; dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const wmap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = wmap[get("weekday")] ?? new Date(now).getUTCDay();
  // "24" can appear at midnight in some environments; normalize to 0.
  const hour = Number(get("hour")) % 24;
  const minutes = hour * 60 + Number(get("minute"));
  return { dateStr, dow, minutes };
}

function dayRanges(weekly: WeeklyHours | null | undefined, dow: number) {
  const entry = weekly?.find((d) => d.day === dow);
  if (!entry || entry.closed) return [];
  return entry.ranges
    .map((r) => ({ open: hmToMinutes(r.open), close: hmToMinutes(r.close) }))
    .filter((r): r is { open: number; close: number } => r.open !== null && r.close !== null && r.close > r.open);
}

export function computeStoreStatus(
  settings: Pick<StoreSettings, "isOpen" | "weeklyHours" | "timezone" | "openingHours"> | undefined,
  closedDays: Pick<ClosedDay, "date" | "reason">[],
  now: Date = new Date(),
): StoreStatus {
  const tz = settings?.timezone || "America/Sao_Paulo";

  // Manual override always wins: an operator forcing the store closed.
  if (settings?.isOpen === false) {
    return { open: false, reason: "A loja está fechada no momento.", nextOpen: null };
  }

  const weekly = settings?.weeklyHours;
  // No structured schedule configured: fall back to the legacy behavior where
  // isOpen !== false means open (operators rely on the manual toggle).
  if (!weekly || weekly.length === 0) {
    return { open: true, reason: "Aberto.", nextOpen: null };
  }

  const { dateStr, dow, minutes } = localParts(now, tz);

  const closedToday = closedDays.find((c) => String(c.date) === dateStr);
  if (closedToday) {
    return {
      open: false,
      reason: closedToday.reason ? `Fechado hoje: ${closedToday.reason}.` : "Fechado hoje.",
      nextOpen: findNextOpen(weekly, closedDays, dow, minutes, dateStr, true),
    };
  }

  const ranges = dayRanges(weekly, dow);
  const openNow = ranges.some((r) => minutes >= r.open && minutes < r.close);
  if (openNow) {
    return { open: true, reason: "Aberto agora.", nextOpen: null };
  }

  return {
    open: false,
    reason: "Fora do horário de atendimento.",
    nextOpen: findNextOpen(weekly, closedDays, dow, minutes, dateStr, false),
  };
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addDaysToDateStr(dateStr: string, n: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Best-effort next opening label by scanning up to 7 days forward. */
function findNextOpen(
  weekly: WeeklyHours,
  closedDays: Pick<ClosedDay, "date" | "reason">[],
  dow: number,
  minutes: number,
  dateStr: string,
  skipToday: boolean,
): string | null {
  const closedSet = new Set(closedDays.map((c) => String(c.date)));
  for (let offset = 0; offset < 8; offset++) {
    const checkDate = addDaysToDateStr(dateStr, offset);
    if (closedSet.has(checkDate)) continue;
    const checkDow = (dow + offset) % 7;
    const ranges = dayRanges(weekly, checkDow).sort((a, b) => a.open - b.open);
    for (const r of ranges) {
      const isToday = offset === 0 && !skipToday;
      if (isToday && minutes >= r.open) continue; // already passed today
      const when = offset === 0 ? "hoje" : offset === 1 ? "amanhã" : DAY_LABEL[checkDow];
      return `Abre ${when} às ${fmtMinutes(r.open)}.`;
    }
  }
  return null;
}
