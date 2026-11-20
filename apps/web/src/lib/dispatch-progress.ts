type PlannedStop = { id: string; arrivalSeconds: number };
type OrderProgress = { id: string; status: string | null; deliveryStatus: string | null; deliveredAt: Date | null; totalCents: number; paymentStatus: string | null };

export function dispatchProgress(
  stops: PlannedStop[], orders: OrderProgress[],
  { departure, now, startedAt, returnedAt, returnSeconds, serviceSeconds }: {
    departure: number; now: number; startedAt: Date | null; returnedAt: Date | null; returnSeconds: number; serviceSeconds: number;
  },
) {
  const ordersById = new Map(orders.map(order => [order.id, order]));
  let delayMs = 0;
  let lastDeliveryMs = 0;
  const progress = stops.map(stop => {
    const order = ordersById.get(stop.id);
    const cancelled = !order || order.status === "cancelled";
    const delivered = !cancelled && (order.status === "delivered" || order.deliveryStatus === "delivered");
    const deliveredAt = delivered ? order.deliveredAt : null;
    const expectedMs = departure + stop.arrivalSeconds * 1000;
    const estimatedArrival = new Date(expectedMs + delayMs);
    if (deliveredAt && deliveredAt.getTime() > lastDeliveryMs) {
      lastDeliveryMs = deliveredAt.getTime();
      // The delivery confirmation replaces the service time for this stop.
      delayMs = lastDeliveryMs - expectedMs - serviceSeconds * 1000;
    }
    return {
      ...stop,
      status: order?.status ?? null,
      state: cancelled ? "cancelled" as const : delivered ? "delivered" as const : "pending" as const,
      estimatedArrival,
      deliveredAt,
      amountToCollectCents: !cancelled && !delivered && order.paymentStatus !== "paid" ? order.totalCents : 0,
    };
  });
  const deliveries = progress.filter(stop => stop.state !== "cancelled");
  const pending = deliveries.filter(stop => stop.state === "pending");
  const current = startedAt && !returnedAt ? pending[0] : undefined;
  const phase = returnedAt ? "returned" : !startedAt ? "waiting" : current ? "delivering" : "returning";
  const firstArrival = current?.estimatedArrival.getTime();
  const delayFromCurrent = firstArrival === undefined ? 0 : Math.max(0, now - firstArrival);
  const lastPending = pending.at(-1);
  const lastPendingArrival = lastPending
    ? lastPending.estimatedArrival.getTime() + (lastPending === current ? 0 : delayFromCurrent) : null;
  const returnStart = lastDeliveryMs || departure;
  const returnAt = (lastPendingArrival === null ? returnStart
    : Math.max(lastPendingArrival, startedAt ? now : departure) + serviceSeconds * 1000) + returnSeconds * 1000;
  const segment = current ? {
    from: Math.max(departure, ...progress.slice(0, progress.indexOf(current)).map(stop => stop.deliveredAt?.getTime() ?? 0)),
    to: current.estimatedArrival.getTime(),
  } : phase === "returning" ? { from: returnStart, to: returnAt } : null;
  return {
    phase, segment,
    totalStops: deliveries.length,
    remainingStops: pending.length,
    currentStopId: current?.id ?? null,
    currentPosition: current ? deliveries.indexOf(current) + 1 : null,
    amountToCollectCents: pending.reduce((sum, stop) => sum + stop.amountToCollectCents, 0),
    returnEstimate: phase === "returned" ? null : new Date(returnAt),
    stops: progress.map(stop => stop.state === "pending" && stop !== current && delayFromCurrent
      ? { ...stop, estimatedArrival: new Date(stop.estimatedArrival.getTime() + delayFromCurrent) } : stop),
  };
}
