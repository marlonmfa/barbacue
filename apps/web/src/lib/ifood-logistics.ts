import { z } from "zod";

export const logisticsLabels = {
  assignDriver: "Designar entregador",
  goingToOrigin: "A caminho da loja",
  arrivedAtOrigin: "Chegou à loja",
  dispatch: "Saiu para entrega",
  arrivedAtDestination: "Chegou ao destino",
  verifyDeliveryCode: "Validar código de entrega",
} as const;

export const logisticsVehicles = {
  MOTORCYCLE: "Moto", BICYCLE: "Bicicleta", CAR: "Carro", WALKING: "A pé",
} as const;

export const logisticsAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assignDriver"),
    workerName: z.string().trim().min(2).max(120),
    workerPhone: z.string().trim().regex(/^\d{10,11}$/),
    workerVehicleType: z.enum(["MOTORCYCLE", "BICYCLE", "CAR", "WALKING"]),
  }).strict(),
  z.object({ action: z.enum(["goingToOrigin", "arrivedAtOrigin", "dispatch", "arrivedAtDestination"]) }).strict(),
  z.object({ action: z.literal("verifyDeliveryCode"), code: z.string().trim().regex(/^\d{4}$/) }).strict(),
]);

export type LogisticsAction = keyof typeof logisticsLabels;
export interface LogisticsEvent { code: string; fullCode: string | null; createdAt: string }
export interface LogisticsState {
  displayId: string | null;
  deliveredBy: string | null;
  next: LogisticsAction | null;
  events: LogisticsEvent[];
}

const movement = [
  ["ADR", "ASSIGN_DRIVER", "goingToOrigin"],
  ["GTO", "GOING_TO_ORIGIN", "arrivedAtOrigin"],
  ["AAO", "ARRIVED_AT_ORIGIN", "dispatch"],
  ["DSP", "DISPATCHED", "arrivedAtDestination"],
  ["AAD", "ARRIVED_AT_DESTINATION", null],
] as const;

export function nextLogisticsAction(events: Pick<LogisticsEvent, "code" | "fullCode">[]): LogisticsAction | null {
  const has = (code: string, fullCode: string) => events.some(event => event.code === code || event.fullCode === fullCode);
  if (has("CAN", "CANCELLED") || has("CON", "CONCLUDED") || has("DDCS", "DELIVERY_DROP_CODE_SUCCEEDED")) return null;
  const phase = movement.findLast(([code, fullCode]) => has(code, fullCode));
  if (phase?.[0] === "AAD") return has("DDCR", "DELIVERY_DROP_CODE_REQUESTED") ? "verifyDeliveryCode" : null;
  return phase ? phase[2] : "assignDriver";
}
