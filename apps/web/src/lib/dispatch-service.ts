import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveryQuotes, deliverySettings, dispatchRoutes, dispatchSettings, orderSchedules, orders, staffPresence, staffUsers } from "@/db/schema";
import { DeliveryError, deliveryAddressKey, deliveryCoordinatesSchema, type DeliveryCoordinates } from "@/lib/delivery";
import { deliveryProviderConfigured, getDeliveryProvider } from "@/lib/delivery-provider";
import { defaultDispatchConfig, evaluateDispatch, planDispatch, waitLimitMs, type DispatchConfig, type DispatchIssue, type DispatchOrder, type DispatchPlan, type DispatchReport } from "@/lib/dispatch-planner";
import { dispatchProgress } from "@/lib/dispatch-progress";
import { can } from "@/lib/permissions";
import { dispatchAvailablePresence } from "@/lib/courier-availability";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Route = typeof dispatchRoutes.$inferSelect;
const batchSize = 16;
const settingsFilter = eq(dispatchSettings.id, 1);
const queued = and(isNull(dispatchRoutes.startedAt), isNull(dispatchRoutes.releasedAt));
const placedAt = sql<Date>`coalesce(${orders.sourceCreatedAt}, ${orders.createdAt})`.mapWith(orders.createdAt);
const scheduledAt = sql<Date>`(select ${orderSchedules.scheduledAt} from ${orderSchedules}
  where ${orderSchedules.orderId} = ${orders.id} and ${orderSchedules.state} = 'released')`.mapWith(orderSchedules.scheduledAt);
const ownDelivery = and(
  eq(orders.orderType, "delivery"), eq(orders.status, "ready"), isNull(orders.archivedAt),
  isNull(orders.deliveryStatus), isNull(orders.deliveryDriverId), isNull(orders.dispatchedAt), isNull(orders.deliveredAt),
  or(isNull(orders.channel), ne(orders.channel, "ifood")),
  or(isNull(orders.channel), ne(orders.channel, "online"), eq(orders.paymentStatus, "paid")),
);
const orderFields = { id: orders.id, brand: orders.brand, address: orders.deliveryAddress, placedAt, scheduledAt };
const driverFields = { id: staffUsers.id, name: staffUsers.name, role: staffUsers.role, permissions: staffUsers.permissions, vehicleModel: staffUsers.vehicleModel, vehicleColor: staffUsers.vehicleColor };
const activeDriver = and(eq(staffUsers.role, "driver"), eq(staffUsers.active, true));
const openRoute = and(sql`${dispatchRoutes.startedAt} is not null`, isNull(dispatchRoutes.returnedAt));
const hasUnfinishedStops = sql`exists (select 1 from ${orders} where ${orders.dispatchRouteId} = ${dispatchRoutes.id}
  and ${orders.status} is distinct from 'cancelled' and ${orders.status} is distinct from 'delivered'
  and ${orders.deliveryStatus} is distinct from 'delivered')`;
const busyDriver = sql`(exists (select 1 from ${orders} where ${orders.deliveryDriverId} = ${staffUsers.id}
  and ${orders.deliveryStatus} in ('assigned', 'out_for_delivery') and ${orders.status} not in ('cancelled', 'delivered'))
  or exists (select 1 from ${dispatchRoutes} where ${dispatchRoutes.driverId} = ${staffUsers.id} and ${openRoute}))`;

class DispatchError extends Error {
  constructor(message: string, public status: number = 409) { super(message); }
}

async function lockSettings(tx: Tx) {
  await tx.insert(dispatchSettings).values({ id: 1, config: defaultDispatchConfig }).onConflictDoNothing();
  const [row] = await tx.select().from(dispatchSettings).where(settingsFilter).for("update");
  return row;
}

function originFrom(row?: typeof deliverySettings.$inferSelect) {
  const parsed = deliveryCoordinatesSchema.safeParse({ latitude: row?.originLatitude, longitude: row?.originLongitude });
  if (!parsed.success || !row) return null;
  return { coordinates: parsed.data, key: JSON.stringify([row.provider, parsed.data.latitude, parsed.data.longitude]), provider: row.provider };
}

async function readOrigin(tx?: Tx) {
  const query = (tx ?? db).select().from(deliverySettings).where(eq(deliverySettings.id, 1));
  const [row] = await (tx ? query.for("share") : query);
  return originFrom(row);
}

function matchesPlan(rows: { id: string; address: string | null; brand: string; placedAt: Date | null; scheduledAt: Date | null }[], plan: DispatchPlan) {
  return rows.length === plan.stops.length && plan.stops.every(stop =>
    rows.some(row => row.id === stop.id && row.brand === stop.brand && row.address?.trim() === stop.address && row.placedAt?.getTime() === stop.placedAt &&
      (row.scheduledAt?.getTime() ?? null) === (stop.scheduledAt ?? null)));
}

async function release(tx: Tx, route: Route, now: Date) {
  await tx.update(orders).set({ dispatchRouteId: null, dispatchPosition: null }).where(eq(orders.dispatchRouteId, route.id));
  await tx.update(dispatchRoutes).set({ releasedAt: now }).where(eq(dispatchRoutes.id, route.id));
}

async function refreshQueue(auto: boolean) {
  return db.transaction(async tx => {
    const state = await lockSettings(tx);
    if (auto && !state.config.automatic) return null;
    const origin = await readOrigin(tx);
    const routes = await tx.select().from(dispatchRoutes).where(queued);
    const ready = routes.length
      ? await tx.select({ ...orderFields, routeId: orders.dispatchRouteId }).from(orders)
        .where(and(ownDelivery, inArray(orders.dispatchRouteId, routes.map(route => route.id))))
      : [];
    const now = new Date();
    for (const route of routes) {
      if (route.originKey === origin?.key &&
          !evaluateDispatch(route.plan, state.config, now.getTime()).violations.length &&
          matchesPlan(ready.filter(row => row.routeId === route.id), route.plan)) continue;
      await release(tx, route, now);
    }
    return { state, origin };
  });
}

async function generate(auto: boolean) {
  if (auto) {
    const [settings] = await db.select({ config: dispatchSettings.config }).from(dispatchSettings).where(settingsFilter);
    if (!settings?.config.automatic) return null;
  }
  const snapshot = await refreshQueue(auto);
  if (!snapshot) return null;
  const { state, origin } = snapshot;
  const { config } = state;
  const issues: DispatchIssue[] = [];
  let plans: DispatchPlan[] = [];
  let error: string | undefined;
  try {
    const previousIssues = state.report?.issues.map(issue => issue.id) ?? [];
    const candidates = await db.select({ ...orderFields, quoteAddress: deliveryQuotes.addressKey,
      latitude: deliveryQuotes.destinationLatitude, longitude: deliveryQuotes.destinationLongitude })
      .from(orders).leftJoin(deliveryQuotes, eq(orders.deliveryQuoteId, deliveryQuotes.id))
      .where(and(ownDelivery, isNull(orders.dispatchRouteId), gt(sql`coalesce(${scheduledAt}, ${placedAt})`, new Date(Date.now() - waitLimitMs(config))),
        sql`nullif(btrim(${orders.deliveryAddress}), '') is not null`))
      .orderBy(...(previousIssues.length ? [asc(inArray(orders.id, previousIssues))] : []), asc(placedAt), asc(orders.id))
      .limit(batchSize);

    if (candidates.length) {
      if (!origin || !deliveryProviderConfigured(origin.provider)) {
        throw new DispatchError("Configure o endereço de saída e o serviço de mapas em Entrega e frete.", 503);
      }
      const provider = getDeliveryProvider(origin.provider);
      const destinations: DeliveryCoordinates[] = [origin.coordinates];
      const available: DispatchOrder[] = [];
      for (const row of candidates) {
        const address = row.address!.trim();
        const quoted = deliveryCoordinatesSchema.safeParse({ latitude: row.latitude, longitude: row.longitude });
        try {
          const point = quoted.success && row.quoteAddress === deliveryAddressKey(address)
            ? quoted.data : await provider.geocode(address, { allowRegionalMatch: true });
          available.push({ id: row.id, address, brand: row.brand, placedAt: row.placedAt!.getTime(), scheduledAt: row.scheduledAt?.getTime() ?? null, point });
          destinations.push(point);
        } catch (cause) {
          if (!(cause instanceof DeliveryError) || cause.code !== "delivery_address_not_found") throw cause;
          issues.push({ id: row.id, reason: "Endereço sem localização precisa" });
        }
      }
      if (available.length) {
        const matrix = await provider.matrix(destinations);
        const result = planDispatch(available, matrix, config, Date.now());
        plans = result.plans;
        issues.push(...result.issues);
      }
    }
  } catch (cause) {
    if (!(cause instanceof DispatchError) && !(cause instanceof DeliveryError)) throw cause;
    error = cause instanceof DispatchError ? cause.message : "O serviço de mapas está indisponível para planejar as rotas.";
  }

  return db.transaction(async tx => {
    const current = await lockSettings(tx);
    if (current.revision !== state.revision) throw new DispatchError("As regras mudaram durante o planejamento. Gere as rotas novamente.");
    const currentOrigin = await readOrigin(tx);
    if (origin?.key !== currentOrigin?.key) throw new DispatchError("O endereço de saída mudou durante o planejamento. Gere as rotas novamente.");
    let created = 0;
    if (plans.length && origin) {
      const ids = plans.flatMap(plan => plan.stops.map(stop => stop.id));
      const ready = await tx.select(orderFields).from(orders)
        .where(and(ownDelivery, isNull(orders.dispatchRouteId), inArray(orders.id, ids)))
        .orderBy(asc(orders.id)).for("update");
      const readyById = new Map(ready.map(row => [row.id, row]));
      for (const plan of plans) {
        const rows = plan.stops.flatMap(stop => readyById.get(stop.id) ?? []);
        if (!matchesPlan(rows, plan)) continue;
        const violations = evaluateDispatch(plan, config, Date.now()).violations;
        if (violations.length) {
          issues.push(...plan.stops.map(stop => ({ id: stop.id, reason: violations.join(" · ") })));
          continue;
        }
        const [route] = await tx.insert(dispatchRoutes).values({ plan, originKey: origin.key }).returning({ id: dispatchRoutes.id });
        for (const [index, stop] of plan.stops.entries()) {
          await tx.update(orders).set({ dispatchRouteId: route.id, dispatchPosition: index + 1 }).where(eq(orders.id, stop.id));
        }
        created++;
      }
    }
    const report: DispatchReport = { time: new Date().toISOString(), created, issues, error };
    if (!auto || created || issues.length || error || current.report?.issues.length || current.report?.error) {
      await tx.update(dispatchSettings).set({ report }).where(settingsFilter);
    }
    return report;
  });
}

let inProgress: ReturnType<typeof generate> | undefined;
export async function generateDispatch(auto = false) {
  if (inProgress) {
    if (auto) return null;
    const report = await inProgress;
    if (report) return report;
  }
  inProgress ??= generate(auto).finally(() => { inProgress = undefined; });
  return inProgress;
}

export async function saveDispatchConfig(config: DispatchConfig, revision: number) {
  if (config.automatic) {
    const origin = await readOrigin();
    if (!origin || !deliveryProviderConfigured(origin.provider)) throw new DispatchError("Configure a origem e o serviço de mapas antes de ativar o agente.", 422);
  }
  return db.transaction(async tx => {
    const current = await lockSettings(tx);
    if (current.revision !== revision) throw new DispatchError("A configuração foi alterada em outra sessão. Atualize o painel.");
    await tx.update(dispatchSettings).set({ config, revision: revision + 1, report: null }).where(settingsFilter);
  });
}

export async function changeDispatchRoute(id: string, driverId: number | null) {
  return db.transaction(async tx => {
    const { config } = await lockSettings(tx);
    const origin = driverId === null ? null : await readOrigin(tx);
    const [route] = await tx.select().from(dispatchRoutes).where(and(eq(dispatchRoutes.id, id), queued)).for("update");
    if (!route) throw new DispatchError("A rota já saiu ou foi retirada da fila.");
    if (driverId === null) {
      await release(tx, route, new Date());
      return;
    }
    const locked = await tx.select(orderFields).from(orders)
      .where(and(eq(orders.dispatchRouteId, route.id), ownDelivery)).orderBy(asc(orders.id)).for("update");
    if (route.originKey !== origin?.key || !matchesPlan(locked, route.plan)) {
      throw new DispatchError("A origem ou os pedidos da rota mudaram. Gere as rotas novamente.");
    }
    const [driver] = await tx.select(driverFields).from(staffUsers)
      .where(and(eq(staffUsers.id, driverId), activeDriver)).for("update");
    const [presence] = await tx.select({ id: staffPresence.userId }).from(staffPresence)
      .where(and(eq(staffPresence.userId, driverId), dispatchAvailablePresence)).for("share");
    const [busy] = await tx.select({ id: staffUsers.id }).from(staffUsers)
      .where(and(eq(staffUsers.id, driverId), busyDriver));
    if (!driver || !can(driver, "deliveries") || !presence || busy) throw new DispatchError("Escolha um entregador online com acesso e sem entregas em andamento.");
    const now = new Date();
    const { earliestDeparture, violations } = evaluateDispatch(route.plan, config, now.getTime());
    if (now.getTime() < earliestDeparture) throw new DispatchError("A rota contém uma entrega agendada. Aguarde o horário de saída.");
    if (violations.length) throw new DispatchError(`A rota viola as regras atuais: ${violations.join(" · ")}. Gere as rotas novamente.`);
    await tx.update(orders).set({ deliveryDriverId: driverId, deliveryStatus: "out_for_delivery", dispatchedAt: now })
      .where(eq(orders.dispatchRouteId, id));
    await tx.update(dispatchRoutes).set({ driverId, startedAt: now, departureConfig: config }).where(eq(dispatchRoutes.id, id));
  });
}

export async function returningDispatchRoute(driverId: number) {
  const [route] = await db.select({ id: dispatchRoutes.id }).from(dispatchRoutes)
    .where(and(eq(dispatchRoutes.driverId, driverId), openRoute, sql`not ${hasUnfinishedStops}`))
    .orderBy(asc(dispatchRoutes.startedAt)).limit(1);
  return route?.id ?? null;
}

export async function confirmDispatchReturn(id: string, driverId: number) {
  const [updated] = await db.update(dispatchRoutes).set({ returnedAt: new Date(), gps: null })
    .where(and(eq(dispatchRoutes.id, id), eq(dispatchRoutes.driverId, driverId), openRoute, sql`not ${hasUnfinishedStops}`))
    .returning({ id: dispatchRoutes.id });
  if (updated) return;
  const [closed] = await db.select({ id: dispatchRoutes.id }).from(dispatchRoutes)
    .where(and(eq(dispatchRoutes.id, id), eq(dispatchRoutes.driverId, driverId), sql`${dispatchRoutes.returnedAt} is not null`));
  if (!closed) throw new DispatchError("O retorno só pode ser confirmado pelo entregador da rota após concluir as paradas.");
}

export async function dispatchOverview(includeAllPending = false) {
  const recent = new Date(Date.now() - 24 * 60 * 60_000);
  const pendingOrders = db.select({ ...orderFields, count: sql<number>`count(*) over ()`.mapWith(Number) })
    .from(orders).where(and(ownDelivery, isNull(orders.dispatchRouteId))).orderBy(asc(placedAt), asc(orders.id));
  const [[state], origin, routes, candidates, roster, [ifood]] = await Promise.all([
    db.select().from(dispatchSettings).where(settingsFilter),
    readOrigin(),
    db.select({ route: dispatchRoutes, driverName: staffUsers.name, vehicleModel: staffUsers.vehicleModel, vehicleColor: staffUsers.vehicleColor }).from(dispatchRoutes)
      .leftJoin(staffUsers, eq(dispatchRoutes.driverId, staffUsers.id))
      .where(or(queued, openRoute, gt(dispatchRoutes.startedAt, recent), gt(dispatchRoutes.returnedAt, recent)))
      .orderBy(desc(isNull(dispatchRoutes.startedAt)), asc(dispatchRoutes.createdAt)).limit(100),
    includeAllPending ? pendingOrders : pendingOrders.limit(50),
    db.select({
      ...driverFields, active: staffUsers.active, declaredAvailableUntil: staffPresence.declaredAvailableUntil,
      online: sql<boolean>`(${dispatchAvailablePresence}) is true`,
      busy: sql<boolean>`${busyDriver}`,
    }).from(staffUsers)
      .leftJoin(staffPresence, eq(staffUsers.id, staffPresence.userId))
      .where(eq(staffUsers.role, "driver")).orderBy(asc(staffUsers.name), asc(staffUsers.id)),
    // O monitor iFood registra DSP em delivery_status e CON/CAN em status.
    db.select({
      inPreparation: sql<number>`count(*) filter (where ${orders.status} in ('confirmed', 'preparing') and ${orders.deliveryStatus} is distinct from 'out_for_delivery')`.mapWith(Number),
      awaitingDispatch: sql<number>`count(*) filter (where ${orders.status} = 'ready' and ${orders.deliveryStatus} is distinct from 'out_for_delivery')`.mapWith(Number),
      dispatched: sql<number>`count(*) filter (where ${orders.deliveryStatus} = 'out_for_delivery')`.mapWith(Number),
    }).from(orders).where(and(eq(orders.channel, "ifood"), eq(orders.orderType, "delivery"),
      inArray(orders.status, ["confirmed", "preparing", "ready"]), isNull(orders.archivedAt), gt(placedAt, recent))),
  ]);
  const config = state?.config ?? defaultDispatchConfig;
  const now = Date.now();
  const linked = routes.length ? await db.select({ ...orderFields, routeId: orders.dispatchRouteId, status: orders.status, deliveryStatus: orders.deliveryStatus, deliveredAt: orders.deliveredAt, totalCents: orders.totalCents, paymentStatus: orders.paymentStatus, eligible: sql<boolean>`(${ownDelivery}) is true` })
    .from(orders).where(inArray(orders.dispatchRouteId, routes.map(({ route }) => route.id))) : [];
  const mapsReady = !!origin && deliveryProviderConfigured(origin.provider);
  const couriers = roster.map(({ id, name, vehicleModel, vehicleColor, active, online, busy, declaredAvailableUntil, ...permissions }) => ({
    id, name, vehicle: { model: vehicleModel, color: vehicleColor }, active, online, busy, declaredAvailableUntil,
    available: active && online && !busy && can(permissions, "deliveries"),
  }));
  return {
    config, revision: state?.revision ?? 0, report: state?.report ?? null,
    mapsReady,
    couriers, ifood,
    drivers: couriers.filter(courier => courier.available).map(({ id, name, vehicle }) => ({ id, name, vehicle })),
    routes: routes.map(({ route, driverName, vehicleModel, vehicleColor }) => {
      const stats = evaluateDispatch(route.plan, route.departureConfig ?? config, route.startedAt?.getTime() ?? now);
      const rows = linked.filter(row => row.routeId === route.id);
      if (!route.startedAt && route.originKey !== origin?.key) stats.violations.push("A origem da loja mudou");
      if (!route.startedAt && !matchesPlan(rows.filter(row => row.eligible), route.plan)) {
        stats.violations.push("Um pedido da rota mudou");
      }
      const progress = dispatchProgress(stats.stops, rows, {
        departure: route.startedAt?.getTime() ?? Math.max(now, stats.earliestDeparture), now,
        startedAt: route.startedAt, returnedAt: route.returnedAt,
        returnSeconds: route.plan.returnLeg.durationSeconds, serviceSeconds: (route.departureConfig ?? config).serviceSeconds,
      });
      return {
        ...progress,
        id: route.id, createdAt: route.createdAt, startedAt: route.startedAt, returnedAt: route.returnedAt, driverId: route.driverId, driverName,
        vehicle: { model: vehicleModel, color: vehicleColor },
        waitingForScheduledTime: !route.startedAt && now < stats.earliestDeparture,
        earliestDeparture: Number.isFinite(stats.earliestDeparture) ? new Date(stats.earliestDeparture) : null,
        latestDeparture: new Date(stats.latestDeparture), distanceMeters: stats.distanceMeters, durationSeconds: stats.durationSeconds,
        violations: route.startedAt ? [] : stats.violations,
      };
    }),
    readyWithoutRoute: candidates[0]?.count ?? 0,
    pending: candidates.map(({ count: _count, ...row }) => ({
      ...row,
      reason: !row.address?.trim() ? "Endereço ausente" :
        !row.placedAt ? "Horário do pedido ausente" :
        now >= (row.scheduledAt ?? row.placedAt).getTime() + waitLimitMs(config) ? "Espera máxima atingida" :
        !mapsReady ? "Origem ou serviço de mapas indisponível" :
        state?.report?.issues.find(issue => issue.id === row.id)?.reason ?? "Aguardando planejamento",
    })),
  };
}

export function dispatchFailure(error: unknown) {
  if (error instanceof DispatchError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Dispatch request failed", error instanceof Error ? error.name : "unknown");
  return Response.json({ error: "Não foi possível atualizar o despacho." }, { status: 500 });
}
