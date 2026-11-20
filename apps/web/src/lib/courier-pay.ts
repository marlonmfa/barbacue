export const courierPayRules = {
  baseCents: 11000,
  includedDeliveries: 10,
  extraDeliveryCents: 600,
  thresholdMeters: 5000,
  centsPerKilometre: 100,
  timeZone: "America/Sao_Paulo",
  dayStartHour: 6,
} as const;

const localParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: courierPayRules.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23",
});

export function courierOperatingDay(date = new Date()) {
  const { year, month, day, hour } = Object.fromEntries(localParts.formatToParts(date).map(part => [part.type, part.value]));
  const local = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number(hour) < courierPayRules.dayStartHour) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}

export function validOperatingDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < "2000-01-01") return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

export function validCourierDistance(meters: number | null | undefined): meters is number {
  return Number.isSafeInteger(meters) && (meters ?? 0) > 0;
}

export function courierDistanceBonus(meters: number | null | undefined): number | null {
  if (!validCourierDistance(meters)) return null;
  const { thresholdMeters, centsPerKilometre } = courierPayRules;
  return meters > thresholdMeters ? Math.round(meters * centsPerKilometre / 1000) : 0;
}

export function summarizeCourierPay<T extends { distanceMeters: number | null }>(deliveries: T[], confirmedShift = false) {
  const baseCents = deliveries.length || confirmedShift ? courierPayRules.baseCents : 0;
  const extraDeliveries = Math.max(0, deliveries.length - courierPayRules.includedDeliveries);
  const extraCents = extraDeliveries * courierPayRules.extraDeliveryCents;
  const lines = deliveries.map((delivery, index) => ({
    ...delivery, sequence: index + 1, distanceBonusCents: courierDistanceBonus(delivery.distanceMeters),
    extraCents: index >= courierPayRules.includedDeliveries ? courierPayRules.extraDeliveryCents : 0,
  }));
  const distanceCents = lines.reduce((sum, line) => sum + (line.distanceBonusCents ?? 0), 0);
  const pendingDistances = lines.filter(line => line.distanceBonusCents === null).length;
  return {
    baseCents, extraDeliveries, extraCents, distanceCents, pendingDistances,
    totalCents: baseCents + extraCents + distanceCents,
    deliveries: lines,
  };
}
