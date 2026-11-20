"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";
import queue from "@/components/admin/OperationalQueue.module.css";
import { dispatchConfigSchema, dispatchMetrics, type DispatchConfig, type DispatchReport } from "@/lib/dispatch-planner";
import { CourierPayPanel } from "./CourierPayPanel";
import { DispatchMotorcycle, type DispatchVehicle } from "./DispatchMotorcycle";
import styles from "./page.module.css";

type Route = {
  id: string; driverId: number | null; startedAt: string | null; earliestDeparture: string | null; latestDeparture: string; driverName: string | null; waitingForScheduledTime: boolean;
  distanceMeters: number; durationSeconds: number; violations: string[];
  vehicle: DispatchVehicle;
  segment: { from: number; to: number } | null;
  phase: "waiting" | "delivering" | "returning" | "returned";
  totalStops: number; remainingStops: number; currentStopId: string | null; currentPosition: number | null;
  amountToCollectCents: number; returnEstimate: string | null; returnedAt: string | null;
  googleMapsLinks?: string[];
  stops: { id: string; address: string; brand: string; estimatedArrival: string; deliveredAt: string | null;
    state: "pending" | "delivered" | "cancelled"; amountToCollectCents: number }[];
};
type Data = {
  config: DispatchConfig; revision: number; canConfigure: boolean; canReviewCourierPay: boolean; canSetCourierAvailability: boolean; mapsReady: boolean; report: DispatchReport | null;
  ifood: { inPreparation: number; awaitingDispatch: number; dispatched: number };
  routes: Route[]; drivers: { id: number; name: string; vehicle: DispatchVehicle }[];
  couriers: { id: number; name: string; vehicle: DispatchVehicle; active: boolean; online: boolean; busy: boolean; available: boolean; declaredAvailableUntil?: string | null }[];
  readyWithoutRoute: number;
  pending: { id: string; brand: string; address: string | null; placedAt: string | null; scheduledAt: string | null; reason: string }[];
};
type Draft = { config: DispatchConfig; revision: number };
const endpoint = "/api/admin/dispatch";
const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const clock = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const orderTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const minutes = (seconds: number) => Math.ceil(seconds / 60);
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number) => currency.format(cents / 100);
const time = (value: string) => clock.format(new Date(value));
function countdown(value: string, now: number) {
  const delta = new Date(value).getTime() - now;
  const count = delta < 0 ? Math.floor(-delta / 60_000) : Math.ceil(delta / 60_000);
  if (!count) return "agora";
  return delta > 0 ? `${count === 1 ? "falta" : "faltam"} ${count} min` : `${count} min de atraso`;
}
const kilometres = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export default function DispatchPage() {
  const [now, setNow] = useState(Date.now);
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"all" | "created" | "queued" | "pending" | "started">("all");

  const pendingView = tab === "pending";
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(pendingView ? `${endpoint}?view=pending` : endpoint, { cache: "no-store", signal });
      const payload = await response.json();
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o despacho.");
      setData(payload);
      setRefreshError("");
    } catch (cause) {
      if (!signal?.aborted) setRefreshError(cause instanceof Error ? cause.message : "Confira a conexão.");
    }
  }, [pendingView]);
  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void load(controller.signal), 0);
    const timer = window.setInterval(() => void load(controller.signal), 5_000);
    const countdown = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); window.clearInterval(countdown); };
  }, [load]);

  async function mutate(method: "POST" | "PUT" | "PATCH", body?: object, success?: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o despacho.");
      if (method === "PUT") setDraft(null);
      if (method === "POST") {
        setTab(payload.created ? "created" : "pending");
        setNotice(payload.created ? `${payload.created} ${payload.created === 1 ? "rota entrou" : "rotas entraram"} na fila.` : "Nenhuma nova rota atende às regras neste momento.");
      } else if (success) {
        setNotice(success);
        if (method === "PATCH" && body && "driverId" in body && body.driverId !== null) setTab("all");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Confira a conexão.");
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function markAvailable(driverId: number) {
    if (availabilityBusy !== null) return;
    setAvailabilityBusy(driverId); setError(""); setNotice("");
    try {
      const response = await fetch(`${endpoint}/disponibilidade`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível marcar a disponibilidade.");
      await load();
      setNotice("Disponibilidade registrada até as 6h.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível marcar a disponibilidade.");
    } finally { setAvailabilityBusy(null); }
  }

  function edit(config: DispatchConfig) {
    if (data) setDraft({ config, revision: draft?.revision ?? data.revision });
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const parsed = dispatchConfigSchema.safeParse(draft.config);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Revise as regras."); return; }
    void mutate("PUT", { config: parsed.data, revision: draft.revision }, "Configuração salva.");
  }

  const waiting = data?.routes.filter(route => !route.startedAt) ?? [];
  const started = data?.routes.filter(route => route.startedAt) ?? [];
  const activeRoutes = new Map(started.filter(route => !route.returnedAt).map(route => [route.driverId, route]));
  const couriers = data?.couriers ?? [];
  const courierIds = new Set(couriers.map(person => person.id));
  const overview = tab === "all" && couriers.length > 0;
  const visibleRoutes = tab === "created" ? [...waiting, ...started] : tab === "queued" ? waiting : tab === "started" ? started
    : [...started.filter(route => !route.returnedAt && (route.driverId === null || !courierIds.has(route.driverId))), ...waiting];
  const config = draft?.config ?? data?.config;

  function renderRoute(route: Route, riderName?: string, availability?: ReactNode) {
    return <RouteCard key={route.id} route={route} riderName={riderName} availability={availability} drivers={data?.drivers ?? []} busy={busy} now={now}
      start={driverId => void mutate("PATCH", { id: route.id, driverId }, "Saída registrada. As paradas estão em Minhas entregas.")}
      removeStop={stopId => void mutate("PATCH", { id: route.id, removeStopId: stopId }, "Parada removida. O pedido voltou ao planejamento.")}
      release={() => void mutate("PATCH", { id: route.id, driverId: null }, "Pedidos devolvidos para planejamento.")} />;
  }

  function renderCourierRoute(person: Data["couriers"][number]) {
    const route = activeRoutes.get(person.id);
    const riderName = person.name.trim().split(/\s+/, 1)[0];
    const declared = Date.parse(person.declaredAvailableUntil ?? "") > now;
    const status = !person.active ? "Cadastro inativo" : person.available ? "Disponível · Aguardando rota"
      : person.busy ? "Em entrega avulsa" : person.online ? "Indisponível" : "Fora de serviço";
    const action = data?.canSetCourierAvailability && person.active && !declared && (
      <button type="button" className={styles.courierAvailabilityAction} disabled={availabilityBusy !== null}
        aria-label={`Marcar ${person.name} como disponível`} onClick={() => void markAvailable(person.id)}>
        {availabilityBusy === person.id ? "Registrando…" : "Marcar disponível"}
      </button>
    );
    const availability = <div className={styles.courierAvailability}>
      {!route && <span>{status}</span>}
      {declared ? <span>{route ? "Disponibilidade registrada até as 6h" : "Até as 6h"}</span> : action}
    </div>;
    return <section key={person.id} id={`dispatch-courier-route-${person.id}`} aria-label={`Rota de ${person.name}`}>
      {route ? renderRoute(route, riderName, availability)
        : <WaitingTimeline vehicle={person.vehicle} riderName={riderName} availability={availability} />}
    </section>;
  }

  return <div className={`${queue.page} ${styles.dispatchPage}`}>
    <header className={queue.heading}>
      <div><h1>Despacho de entregas</h1><p>Organize pedidos prontos em rotas e registre a saída com o entregador.</p></div>
      <button className={queue.secondary} disabled={!data?.mapsReady || busy} onClick={() => void mutate("POST")}><AdminIcon name="route" /> {busy ? "Processando…" : "Gerar rotas"}</button>
    </header>
    {data?.canReviewCourierPay && <CourierPayPanel />}
    {refreshError && <p className={queue.error} role="alert">{refreshError}</p>}
    {error && <p className={queue.error} role="alert">{error}</p>}
    {notice && <p className={queue.notice} role="status">{notice}</p>}
    {!data || !config ? !refreshError && <p className={queue.empty}>Carregando despacho…</p> : <>
      {!data.mapsReady && <p className={queue.error}>Configure a origem e o serviço de mapas em {data.canConfigure ? <Link href="/admin/delivery-settings">Entrega e frete</Link> : "Entrega e frete"}.</p>}
      {data.report?.error && data.report.error !== error && data.mapsReady && <p className={queue.error} role="status">{data.report.error}</p>}
      <details className={styles.settings}>
        <summary>Regras do agente <span>{data.config.automatic ? "Automático ativo" : "Execução manual"}</span></summary>
        <form className={styles.rules} onSubmit={save}>
          <p>A espera vai do registro do pedido até a chegada estimada. Em pedidos agendados, conta a partir do horário reservado. O roteiro inclui o retorno à loja.</p>
          <fieldset disabled={busy || !data.canConfigure}>
            <div className={styles.options}>
              <label><input type="checkbox" checked={config.automatic} onChange={e => edit({ ...config, automatic: e.target.checked })} /> Gerar rotas automaticamente quando os pedidos estiverem prontos</label>
              <label><input type="checkbox" checked={config.sameBrand} onChange={e => edit({ ...config, sameBrand: e.target.checked })} /> Agrupar só pedidos da mesma marca</label>
              <label htmlFor="dispatch-service">Tempo em cada parada (s) <input id="dispatch-service" type="number" required min={0} max={900} value={Number.isNaN(config.serviceSeconds) ? "" : config.serviceSeconds} onChange={e => edit({ ...config, serviceSeconds: e.target.valueAsNumber })} /></label>
            </div>
            <div className={styles.metrics}>
              {Object.entries(dispatchMetrics).map(([key, metric]) => {
                const id = key as keyof typeof dispatchMetrics;
                const limit = config.rules.find(rule => rule.metric === id)?.limit;
                const setLimit = (value?: number) => edit({ ...config, rules: [
                  ...config.rules.filter(rule => rule.metric !== id),
                  ...(value === undefined ? [] : [{ metric: id, limit: value }]),
                ] });
                return <div className={styles.metric} key={id}>
                  <label>
                    {id !== "waitMinutes" && <input type="checkbox" checked={limit !== undefined} onChange={e => setLimit(e.target.checked ? defaultLimit(id) : undefined)} />}
                    {metric.label}
                  </label>
                  <input type="number" aria-label={metric.label} min={metric.min} max={metric.max} required={limit !== undefined} disabled={limit === undefined} value={limit === undefined || Number.isNaN(limit) ? "" : limit} onChange={e => setLimit(e.target.valueAsNumber)} />
                </div>;
              })}
            </div>
          </fieldset>
          {data.canConfigure && draft && <div className={styles.actions}>
            <button type="submit" className={queue.secondary} disabled={busy}>Salvar regras</button>
            <button type="button" className={queue.secondary} disabled={busy} onClick={() => setDraft(null)}>Descartar alterações</button>
          </div>}
        </form>
      </details>
      <nav className={queue.filters} aria-label="Filtrar despacho">
        <button aria-pressed={tab === "all"} onClick={() => setTab("all")}>Todos</button>
        <button aria-pressed={tab === "created"} onClick={() => setTab("created")}>Rotas criadas <span>{data.routes.length}</span></button>
        <button aria-pressed={tab === "pending"} onClick={() => setTab("pending")}>Pedidos pendentes <span>{data.readyWithoutRoute}</span></button>
        <button aria-pressed={tab === "queued"} onClick={() => setTab("queued")}>Rotas na fila <span>{waiting.length}</span></button>
        <button aria-pressed={tab === "started"} onClick={() => setTab("started")}>Rotas e retornos <span>{started.length}</span></button>
      </nav>
      {tab === "created" && <div className={styles.readyCount} aria-live="polite">
        <button type="button" className={styles.pendingShortcut} onClick={() => setTab("pending")}>
          {data.readyWithoutRoute === 1 ? "1 pedido pronto sem rota" : `${data.readyWithoutRoute} pedidos prontos sem rota`}
        </button>
      </div>}
      {(tab === "all" || tab === "created") && <p className={styles.ifoodSummary}>
        <strong>Entregas iFood</strong>
        <span>{data.ifood.inPreparation} na cozinha · {data.ifood.awaitingDispatch} prontos para sair · {data.ifood.dispatched} em entrega</span>
      </p>}
      {tab === "pending" ? (
        <section aria-labelledby="dispatch-pending-title">
          <h2 id="dispatch-pending-title" className={styles.pendingTitle}>Pedidos prontos sem rota</h2>
          {data.pending.length ? <ul className={styles.pending} role="list" aria-labelledby="dispatch-pending-title">
            {data.pending.map(order => <li key={order.id}>
              <div>
                <Link className={styles.pendingOrderLink} href={`/admin/orders?pedido=${order.id}`}>Pedido #{shortId(order.id)}</Link>
                <span>{order.brand}{order.placedAt && <> · Recebido <time dateTime={order.placedAt}>{orderTime.format(new Date(order.placedAt))}</time></>}
                  {order.scheduledAt && <> · Agendado <time dateTime={order.scheduledAt}>{orderTime.format(new Date(order.scheduledAt))}</time></>}</span>
                <p>{order.address || "Sem endereço"}</p>
              </div>
              <span>{order.reason}</span>
            </li>)}
          </ul> : <p className={queue.empty}>Nenhum pedido pronto aguardando rota.</p>}
        </section>
      ) : (
        <>
          {overview && <div className={`${queue.deliveries} ${styles.routeList} ${styles.courierRoutes}`} role="region" aria-label="Rotas dos entregadores">
            {couriers.map(person => renderCourierRoute(person))}
          </div>}
          {visibleRoutes.length > 0 ? <div className={`${queue.deliveries} ${styles.routeList} ${overview ? styles.unassignedRoutes : ""}`}>
            {visibleRoutes.map(route => renderRoute(route))}
          </div> : !overview && (couriers.length ? <p className={queue.empty}>
            {data.routes.length ? "Nenhuma rota nesta aba." : "Nenhuma rota no momento."}
          </p> : <EmptyTimeline hasRoutes={data.routes.length > 0} />)}
        </>
      )}
      {tab !== "pending" && (visibleRoutes.length > 0 || (overview && activeRoutes.size > 0)) && <p className={styles.attribution}>Dados de mapa © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></p>}
    </>}
  </div>;
}

function defaultLimit(metric: Exclude<keyof typeof dispatchMetrics, "waitMinutes">) {
  return { stops: 4, distanceKm: 25, durationMinutes: 45, legMinutes: 20 }[metric];
}

function RouteCard({ route, riderName, availability, drivers, busy, now, start, release, removeStop }: {
  route: Route; riderName?: string; availability?: ReactNode; now: number; drivers: Data["drivers"]; busy: boolean; start: (driverId: number) => void; release: () => void; removeStop: (stopId: string) => void;
}) {
  const [driver, setDriver] = useState("");
  const [editing, setEditing] = useState(false);
  const mapsLinks = route.googleMapsLinks ?? [];
  const selectedDriver = drivers.find(option => String(option.id) === driver);
  const activeDriver = Boolean(selectedDriver);
  const tooEarly = route.waitingForScheduledTime;
  const phase = {
    waiting: route.waitingForScheduledTime ? "Aguardando horário de saída" : "Aguardando saída",
    delivering: `Entrega ${route.currentPosition} de ${route.totalStops}`,
    returning: "Retornando à loja",
    returned: "Retorno confirmado",
  }[route.phase];
  const remainingAfter = route.remainingStops - 1;
  const remainingLabel = route.phase === "delivering"
    ? remainingAfter ? `${remainingAfter} depois desta` : "Última entrega"
    : route.remainingStops ? `${route.remainingStops} por fazer` : "Nenhuma entrega restante";
  return <article className={queue.delivery}>
    <header className={`${queue.deliveryHeading} ${styles.routeHeading}`}><div>
      <h2>Rota #{shortId(route.id)}</h2>
      <p>{kilometres.format(route.distanceMeters / 1000)} km · {minutes(route.durationSeconds)} min com retorno</p>
      <p className={styles.progress}>
        <strong>{phase}</strong>{!riderName && route.driverName && <> · {route.driverName}</>}
        {" · "}{remainingLabel}
        {" · "}A receber {money(route.amountToCollectCents)}
      </p>
      {route.segment && <p className={styles.estimateNote}>Posição estimada pelo tempo da etapa</p>}
      {route.returnedAt && <p>Chegou à loja às {time(route.returnedAt)}</p>}
    </div><div className={styles.routeActions}>
      {availability}
      {mapsLinks.map((href, index) => <a key={href} className={queue.secondary} href={href}
        target="_blank" rel="noopener noreferrer"><AdminIcon name="route" size={18} />
        {mapsLinks.length === 1 ? "Abrir no Google Maps" : `Google Maps · Trecho ${index + 1}`}
      </a>)}
      {!route.startedAt && <button type="button" className={queue.secondary} aria-expanded={editing}
        aria-controls={editing ? `edit-route-${route.id}` : undefined} onClick={() => setEditing(!editing)}>
        {editing ? "Fechar edição" : "Editar rota"}
      </button>}
    </div></header>
    {editing && !route.startedAt && <section className={styles.routeEditor} id={`edit-route-${route.id}`} aria-label="Editar paradas da rota">
      <p>A parada removida volta ao planejamento. Ao remover a última, a rota sai da fila.</p>
      <ol>{route.stops.map((stop, index) => <li key={stop.id}>
        <span><strong>Parada {index + 1}</strong> · {stop.address}</span>
        <button type="button" className={queue.secondary} disabled={busy} aria-label={`Remover parada ${index + 1}`}
          onClick={() => removeStop(stop.id)}>Remover parada</button>
      </li>)}</ol>
    </section>}
    <RouteTimeline route={route} now={now} riderName={riderName} vehicle={route.startedAt ? route.vehicle : selectedDriver?.vehicle} />
    {!!route.violations.length && <p className={queue.error}>Replaneje esta rota. {route.violations.join(" · ")}</p>}
    {!route.startedAt && <form className={styles.dispatchForm} onSubmit={event => { event.preventDefault(); if (activeDriver && !tooEarly) start(Number(driver)); }}>
      <label>Entregador disponível
        <select value={activeDriver ? driver : ""} onChange={event => setDriver(event.target.value)} disabled={busy || !drivers.length || !!route.violations.length}>
          <option value="">{drivers.length ? "Selecione um entregador" : "Nenhum entregador livre e online"}</option>
          {drivers.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      <button type="submit" className={queue.primary} disabled={!activeDriver || tooEarly || busy || !!route.violations.length}>{tooEarly ? "Aguardando horário de saída" : "Registrar saída da rota"}</button>
      <button type="button" className={queue.secondary} disabled={busy} onClick={release}>Devolver pedidos</button>
    </form>}
  </article>;
}

function estimatedRoutePosition(route: Route, now: number) {
  if (!route.segment) return null;
  const activeIndex = route.phase === "returning" ? route.stops.length : route.stops.findIndex(stop => stop.id === route.currentStopId);
  if (activeIndex < 0) return null;
  const from = route.stops.slice(0, activeIndex).findLastIndex(stop => stop.state === "delivered") + 1;
  const destination = activeIndex + 1;
  const elapsed = Math.min(1, Math.max(0, (now - route.segment.from) / Math.max(1, route.segment.to - route.segment.from)));
  return { destination, step: from + elapsed * (destination - from) };
}

function RouteTimeline({ route, now, vehicle, riderName }: { route: Route; now: number; vehicle?: DispatchVehicle; riderName?: string }) {
  const scroller = useRef<HTMLOListElement>(null);
  const current = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const track = scroller.current;
    const step = current.current;
    if (!track || !step || track.scrollWidth <= track.clientWidth) return;
    track.scrollLeft = step.offsetLeft - (track.clientWidth - step.offsetWidth) / 2;
  }, [route.currentStopId, route.phase]);

  const waiting = route.phase === "waiting";
  const returning = route.phase === "returning";
  const returned = route.phase === "returned";
  const position = estimatedRoutePosition(route, now);
  const markerStyle = position ? {
    "--bike-offset": `${(position.step - position.destination) * 100}%`,
  } as CSSProperties : undefined;
  return <ol className={riderName ? `${styles.timeline} ${styles.namedTimeline}` : styles.timeline} ref={scroller} role="list" aria-label="Sequência de paradas da rota" tabIndex={0}>
    <li className={styles.timelineStep} data-state={waiting ? "current" : "done"}
      aria-current={waiting ? "step" : undefined} ref={waiting ? current : undefined}>
      <div className={styles.trackPoint}>
        {waiting && <DispatchMotorcycle vehicle={vehicle} riderName={riderName} />}
        <span className={styles.point}><AdminIcon name="home" size={17} /></span>
      </div>
      <strong>Saída da loja</strong>
      {route.startedAt ? <time dateTime={route.startedAt}>{time(route.startedAt)}</time>
        : route.waitingForScheduledTime && route.earliestDeparture
          ? <time dateTime={route.earliestDeparture}>{time(route.earliestDeparture)}</time>
          : null}
    </li>
    {route.stops.map((stop, index) => {
      const isCurrent = route.currentStopId === stop.id;
      const date = stop.state === "delivered" ? stop.deliveredAt : stop.estimatedArrival;
      return <li key={stop.id} className={styles.timelineStep}
        data-state={isCurrent ? "current" : stop.state === "delivered" ? "done" : stop.state}
        ref={isCurrent ? current : undefined} aria-current={isCurrent ? "step" : undefined}>
        <div className={styles.trackPoint} style={isCurrent ? markerStyle : undefined}>
          {isCurrent && <DispatchMotorcycle vehicle={vehicle} riderName={riderName} />}
          <span className={styles.point}>{stop.state === "delivered" ? <AdminIcon name="check" size={16} /> : index + 1}</span>
        </div>
        <strong>Parada {index + 1}</strong>
        {stop.state !== "cancelled" && date && <time dateTime={date}>{time(date)}</time>}
        <small>{stop.state === "cancelled" ? "Cancelada" : stop.state === "delivered" ? "Entregue"
          : `Chegada estimada · ${countdown(stop.estimatedArrival, now)}`}</small>
        <span className={styles.stopAddress}>{stop.address}</span>
        <small>#{shortId(stop.id)} · {stop.brand}</small>
        {stop.state === "pending" && stop.amountToCollectCents > 0 && <small>A receber {money(stop.amountToCollectCents)}</small>}
      </li>;
    })}
    <li className={styles.timelineStep} data-state={returned ? "done" : returning ? "returning" : "pending"}
      aria-current={returning || returned ? "step" : undefined} ref={returning || returned ? current : undefined}>
      <div className={styles.trackPoint} style={returning ? markerStyle : undefined}>
        {(returning || returned) && <DispatchMotorcycle vehicle={vehicle} riderName={riderName} />}
        <span className={styles.point}><AdminIcon name={returned ? "check" : "home"} size={17} /></span>
      </div>
      <strong>Volta à loja</strong>
      {route.returnedAt ? <time dateTime={route.returnedAt}>{time(route.returnedAt)}</time>
        : route.returnEstimate ? <><time dateTime={route.returnEstimate}>{time(route.returnEstimate)}</time>
          <small>Chegada estimada · {countdown(route.returnEstimate, now)}</small></> : null}
    </li>
  </ol>;
}

function WaitingTimeline({ vehicle, riderName, availability }: { vehicle: DispatchVehicle; riderName: string; availability: ReactNode }) {
  return <article className={`${queue.delivery} ${styles.waitingRoute}`}>
    {availability}
    <ol className={`${styles.timeline} ${styles.namedTimeline} ${styles.waitingTimeline}`} role="list" aria-label="Linha de entregas em espera">
      <li className={styles.timelineStep} aria-current="step">
        <div className={styles.trackPoint}>
          <DispatchMotorcycle vehicle={vehicle} riderName={riderName} />
          <span className={styles.point}><AdminIcon name="home" size={17} /></span>
        </div>
        <strong>Loja</strong>
      </li>
      <li className={styles.timelineStep}>
        <div className={styles.trackPoint}>
          <span className={styles.point}><AdminIcon name="route" size={17} /></span>
        </div>
        <strong>Entregas</strong>
      </li>
    </ol>
  </article>;
}

function EmptyTimeline({ hasRoutes }: { hasRoutes: boolean }) {
  return <section className={`${queue.delivery} ${styles.timelinePreview}`}>
    <h2>{hasRoutes ? "Nenhuma rota nesta aba" : "Nenhuma rota no momento"}</h2>
    <p>{hasRoutes ? "Confira a aba Todos." : "A linha receberá horários quando houver uma rota planejada. Exemplo:"}</p>
    <ol className={styles.timeline} role="list" aria-label="Exemplo da linha de entregas">
      {["Saída da loja", "Parada 1", "Volta à loja"].map((label, index) =>
        <li key={label} className={styles.timelineStep}>
          <div className={styles.trackPoint}>
            {index === 0 && <DispatchMotorcycle />}
            <span className={styles.point}>{index === 1 ? "1" : <AdminIcon name="home" size={17} />}</span>
          </div>
          <strong>{label}</strong>
        </li>)}
    </ol>
  </section>;
}
