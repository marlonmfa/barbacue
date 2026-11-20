"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";
import queue from "@/components/admin/OperationalQueue.module.css";
import { dispatchConfigSchema, dispatchMetrics, type DispatchConfig, type DispatchReport } from "@/lib/dispatch-planner";
import styles from "./page.module.css";

type Route = {
  id: string; startedAt: string | null; earliestDeparture: string | null; latestDeparture: string; driverName: string | null; waitingForScheduledTime: boolean;
  distanceMeters: number; durationSeconds: number; violations: string[];
  stops: { id: string; address: string; brand: string; arrivalSeconds: number; status: string | null }[];
};
type Data = {
  config: DispatchConfig; revision: number; canConfigure: boolean; mapsReady: boolean; report: DispatchReport | null;
  routes: Route[]; drivers: { id: number; name: string }[];
  pending: { id: string; brand: string; address: string | null; reason: string }[];
};
type Draft = { config: DispatchConfig; revision: number };
const endpoint = "/api/admin/dispatch";
const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const clock = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const minutes = (seconds: number) => Math.ceil(seconds / 60);
const kilometres = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export default function DispatchPage() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"queued" | "pending" | "started">("queued");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o despacho.");
      setData(payload);
      setRefreshError("");
    } catch (cause) {
      if (!signal?.aborted) setRefreshError(cause instanceof Error ? cause.message : "Confira a conexão.");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void load(controller.signal), 0);
    const timer = window.setInterval(() => void load(controller.signal), 10_000);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); };
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
        setTab(payload.created ? "queued" : "pending");
        setNotice(payload.created ? `${payload.created} ${payload.created === 1 ? "rota entrou" : "rotas entraram"} na fila.` : "Nenhuma nova rota atende às regras neste momento.");
      } else if (success) setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Confira a conexão.");
    } finally {
      await load();
      setBusy(false);
    }
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
  const config = draft?.config ?? data?.config;
  return <div className={queue.page}>
    <header className={queue.heading}>
      <div><h1>Despacho de entregas</h1><p>Organize pedidos prontos em rotas e registre a saída com o entregador.</p></div>
      <button className={queue.secondary} disabled={!data?.mapsReady || busy} onClick={() => void mutate("POST")}><AdminIcon name="route" /> {busy ? "Processando…" : "Gerar rotas"}</button>
    </header>
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
              <label><input type="checkbox" checked={config.automatic} onChange={e => edit({ ...config, automatic: e.target.checked })} /> Gerar rotas automaticamente a cada 30 s</label>
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
        <button aria-pressed={tab === "queued"} onClick={() => setTab("queued")}>Rotas na fila <span>{waiting.length}</span></button>
        <button aria-pressed={tab === "pending"} onClick={() => setTab("pending")}>Pedidos sem rota <span>{data.pending.length}{data.pending.length === 50 && "+"}</span></button>
        <button aria-pressed={tab === "started"} onClick={() => setTab("started")}>Saídas de 24 h <span>{started.length}</span></button>
      </nav>
      {tab === "pending" ? (
        data.pending.length ? <ul className={styles.pending}>{data.pending.map(order => <li key={order.id}>
          <div><strong>Pedido #{shortId(order.id)}</strong><span>{order.brand} · {order.address || "Sem endereço"}</span></div>
          <span>{order.reason}</span>
        </li>)}</ul> : <p className={queue.empty}>Nenhum pedido pronto aguardando rota.</p>
      ) : (
        (tab === "queued" ? waiting : started).length ? <div className={queue.deliveries}>
          {(tab === "queued" ? waiting : started).map(route => <RouteCard key={route.id} route={route} drivers={data.drivers} busy={busy}
            start={driverId => void mutate("PATCH", { id: route.id, driverId }, "Saída registrada. As paradas estão em Minhas entregas.")}
            release={() => void mutate("PATCH", { id: route.id, driverId: null }, "Pedidos devolvidos para planejamento.")} />)}
        </div> : <p className={queue.empty}>{tab === "queued" ? "Nenhuma rota na fila de despacho." : "Nenhuma saída registrada nas últimas 24 horas."}</p>
      )}
      {!!data.routes.length && <p className={styles.attribution}>Dados de mapa © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></p>}
    </>}
  </div>;
}

function defaultLimit(metric: Exclude<keyof typeof dispatchMetrics, "waitMinutes">) {
  return { stops: 4, distanceKm: 25, durationMinutes: 45, legMinutes: 20 }[metric];
}

function RouteCard({ route, drivers, busy, start, release }: {
  route: Route; drivers: Data["drivers"]; busy: boolean; start: (driverId: number) => void; release: () => void;
}) {
  const [driver, setDriver] = useState("");
  const activeDriver = drivers.some(option => String(option.id) === driver);
  const tooEarly = route.waitingForScheduledTime;
  return <article className={queue.delivery}>
    <header className={`${queue.deliveryHeading} ${styles.routeHeading}`}><div>
      <span className={`${queue.badge} ${route.violations.length ? "" : queue.ready}`}>
        {route.startedAt ? route.stops.every(stop => stop.status === "delivered" || stop.status === "cancelled") ? "Encerrada" : "Em entrega" : route.violations.length ? "Replanejar" : "Na fila"}
      </span>
      <h2>Rota #{shortId(route.id)}</h2>
      <p>{kilometres.format(route.distanceMeters / 1000)} km · {minutes(route.durationSeconds)} min com retorno</p>
      <p>{route.startedAt ? `Saída às ${clock.format(new Date(route.startedAt))} · ${route.driverName ?? "Entregador"}` : route.earliestDeparture ? `Saída entre ${clock.format(new Date(route.earliestDeparture))} e ${clock.format(new Date(route.latestDeparture))}` : `Despachar até ${clock.format(new Date(route.latestDeparture))}`}</p>
    </div><AdminIcon name="route" size={28} /></header>
    <ol className={styles.stops}>{route.stops.map(stop => <li key={stop.id}>
      <strong>#{shortId(stop.id)} · {stop.brand}</strong><span>{stop.address}</span>
      <small>{stop.status === "delivered" ? "Entregue" : stop.status === "cancelled" ? "Cancelada" : `Chegada estimada em ${minutes(stop.arrivalSeconds)} min após a saída`}</small>
    </li>)}</ol>
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
