export const dispatchGpsFreshMs = 45_000;
export const dispatchGpsIntervalMs = 10_000;

export type DispatchGpsEstimate = {
  at: number;
  progress: number;
  arrivals: { id: string; at: number }[];
  returnAt: number;
};

export type DispatchGpsState = { sessionId: string; estimate?: DispatchGpsEstimate };

export function matchingDispatchGps(state: DispatchGpsState | null, pending: { id: string }[], now: number) {
  const estimate = state?.estimate;
  if (!estimate || estimate.at + dispatchGpsFreshMs <= now || estimate.arrivals.length !== pending.length) return null;
  return pending.every((stop, index) => estimate.arrivals[index].id === stop.id) ? estimate : null;
}
