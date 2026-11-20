import { z } from "zod";
import type { DeliveryCoordinates } from "./delivery.ts";
import type { DeliveryRoadRoute } from "./delivery-provider.ts";

export const dispatchMetrics = {
  waitMinutes: { label: "Espera máxima do cliente (min)", min: 1, max: 1440 },
  stops: { label: "Máximo de paradas", min: 1, max: 12 },
  distanceKm: { label: "Distância máxima com retorno (km)", min: 1, max: 500 },
  durationMinutes: { label: "Duração máxima com retorno (min)", min: 1, max: 1440 },
  legMinutes: { label: "Tempo máximo por trecho (min)", min: 1, max: 1440 },
} as const;

const ruleSchema = z.object({ metric: z.enum(Object.keys(dispatchMetrics) as (keyof typeof dispatchMetrics)[]), limit: z.number().int() }).strict();
export const dispatchConfigSchema = z.object({
  automatic: z.boolean(),
  sameBrand: z.boolean(),
  serviceSeconds: z.number().int().min(0).max(900),
  rules: z.array(ruleSchema).max(Object.keys(dispatchMetrics).length),
}).strict().refine(({ rules }) =>
  rules.some(rule => rule.metric === "waitMinutes") &&
  new Set(rules.map(rule => rule.metric)).size === rules.length &&
  rules.every(({ metric, limit }) => limit >= dispatchMetrics[metric].min && limit <= dispatchMetrics[metric].max),
"Informe a espera máxima e um limite válido para cada métrica selecionada.");

export type DispatchConfig = z.infer<typeof dispatchConfigSchema>;
export const defaultDispatchConfig: DispatchConfig = {
  automatic: false,
  sameBrand: true,
  serviceSeconds: 120,
  rules: [
    { metric: "waitMinutes", limit: 60 },
    { metric: "stops", limit: 4 },
    { metric: "distanceKm", limit: 25 },
    { metric: "durationMinutes", limit: 45 },
  ],
};

export type DispatchOrder = { id: string; address: string; brand: string; placedAt: number; scheduledAt: number | null; point: DeliveryCoordinates };
export type DispatchStop = DispatchOrder & { leg: DeliveryRoadRoute };
export type DispatchPlan = { stops: DispatchStop[]; returnLeg: DeliveryRoadRoute };
export type DispatchIssue = { id: string; reason: string };
export type DispatchReport = { time: string; created: number; issues: DispatchIssue[]; error?: string };

export const waitLimitMs = (config: DispatchConfig) => config.rules.find(rule => rule.metric === "waitMinutes")!.limit * 60_000;

export function evaluateDispatch(plan: DispatchPlan, config: DispatchConfig, departure: number) {
  let elapsed = 0;
  let distance = plan.returnLeg.distanceMeters;
  let longestLeg = plan.returnLeg.durationSeconds;
  let earliestDeparture = -Infinity;
  let latestDeparture = Infinity;
  const maxWait = waitLimitMs(config);
  const stops = plan.stops.map(({ leg, placedAt, scheduledAt, ...stop }) => {
    elapsed += leg.durationSeconds;
    distance += leg.distanceMeters;
    longestLeg = Math.max(longestLeg, leg.durationSeconds);
    if (scheduledAt != null) earliestDeparture = Math.max(earliestDeparture, scheduledAt - elapsed * 1000);
    latestDeparture = Math.min(latestDeparture, (scheduledAt ?? placedAt) + maxWait - elapsed * 1000);
    const arrivalSeconds = elapsed;
    elapsed += config.serviceSeconds;
    return { ...stop, arrivalSeconds };
  });
  const durationSeconds = elapsed + plan.returnLeg.durationSeconds;
  const metrics = {
    stops: stops.length,
    distanceKm: distance / 1000,
    durationMinutes: durationSeconds / 60,
    legMinutes: longestLeg / 60,
  };
  const violations: string[] = config.rules.filter(rule => rule.metric === "waitMinutes" ? Math.max(earliestDeparture, departure) > latestDeparture : metrics[rule.metric] > rule.limit)
    .map(rule => dispatchMetrics[rule.metric].label);
  if (config.sameBrand && new Set(stops.map(stop => stop.brand)).size > 1) violations.push("Uma marca por rota");
  return { stops, distanceMeters: distance, durationSeconds, earliestDeparture, latestDeparture, violations };
}

/** Seed each route with the oldest viable order, then insert stops at the
 * position with the smallest added road time among feasible candidates. */
export function planDispatch(
  orders: DispatchOrder[],
  matrix: (DeliveryRoadRoute | null)[][],
  config: DispatchConfig,
  departure: number,
) {
  function measure(sequence: number[]): DispatchPlan | null {
    const stops: DispatchStop[] = [];
    let previous = 0;
    for (const index of sequence) {
      const leg = matrix[previous][index];
      if (!leg) return null;
      stops.push({ ...orders[index - 1], leg });
      previous = index;
    }
    const returnLeg = matrix[previous][0];
    return returnLeg ? { stops, returnLeg } : null;
  }

  const remaining = new Set(orders.map((_, index) => index + 1)
    .sort((a, b) => orders[a - 1].placedAt - orders[b - 1].placedAt || orders[a - 1].id.localeCompare(orders[b - 1].id)));
  const plans: DispatchPlan[] = [];
  const issues: DispatchIssue[] = [];
  while (remaining.size) {
    const seed = remaining.values().next().value!;
    remaining.delete(seed);
    let plan = measure([seed]);
    const violations = plan ? evaluateDispatch(plan, config, departure).violations : ["Trajeto viário indisponível"];
    if (!plan || violations.length) {
      issues.push({ id: orders[seed - 1].id, reason: violations.join(" · ") });
      continue;
    }

    let sequence = [seed];
    while (sequence.length < dispatchMetrics.stops.max) {
      let best: { sequence: number[]; plan: DispatchPlan; duration: number; index: number } | undefined;
      for (const index of remaining) {
        for (let position = sequence.length; position >= 0; position--) {
          const candidate = [...sequence.slice(0, position), index, ...sequence.slice(position)];
          const measured = measure(candidate);
          if (!measured) continue;
          const { durationSeconds, violations } = evaluateDispatch(measured, config, departure);
          if (violations.length || (best && durationSeconds >= best.duration)) continue;
          best = { sequence: candidate, plan: measured, duration: durationSeconds, index };
        }
      }
      if (!best) break;
      remaining.delete(best.index);
      sequence = best.sequence;
      plan = best.plan;
    }
    plans.push(plan);
  }
  return { plans, issues };
}
