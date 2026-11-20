"use client";

import { useEffect, useState } from "react";
import { courierOperatingDay, courierPayRules, validOperatingDay } from "@/lib/courier-pay";
import type { courierPayReport } from "@/lib/courier-pay-report";
import queue from "@/components/admin/OperationalQueue.module.css";
import styles from "./CourierPayPanel.module.css";

type Report = Awaited<ReturnType<typeof courierPayReport>>;
type Action = { type: "confirmShift"; day: string; driverId: number; confirmed: boolean } |
  { type: "measureDistance"; orderId: string };
const endpoint = "/api/admin/dispatch/remuneracao";
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const km = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const money = (cents: number) => currency.format(cents / 100);

export function CourierPayPanel() {
  const [day, setDay] = useState(courierOperatingDay);
  const [report, setReport] = useState<Report | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !validOperatingDay(day)) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`${endpoint}?dia=${day}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível consultar a remuneração.");
        if (!controller.signal.aborted) setReport(data);
      }).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível consultar a remuneração.");
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [day, open, revision]);

  async function apply(action: Action) {
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível atualizar a apuração.");
      }
      setRevision(current => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a apuração.");
    } finally { setBusy(false); }
  }

  const current = report?.day === day ? report : null;
  return <details className={styles.panel} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Remuneração dos entregadores</summary>
    {open && <div className={styles.body}>
      <div className={styles.filters}>
        <label>Dia operacional <input type="date" value={day} max={courierOperatingDay()} disabled={busy} onChange={event => setDay(event.target.value)} /></label>
        <button type="button" className={queue.secondary} disabled={loading || busy || !validOperatingDay(day)} onClick={() => setRevision(current => current + 1)}>Atualizar apuração</button>
      </div>
      <p>Arrancada de {money(courierPayRules.baseCents)} por turno trabalhado. As primeiras {courierPayRules.includedDeliveries} entregas estão incluídas. A partir da 11ª, some {money(courierPayRules.extraDeliveryCents)} por entrega concluída.</p>
      <p>Acima de 5 km, some {money(courierPayRules.centsPerKilometre)} por km sobre toda a distância da loja ao destino. O dia operacional vira às 6h. Esta tela apura valores para conferência.</p>
      {error && <p className={queue.error} role="alert">{error}</p>}
      {loading && <p role="status">Atualizando apuração…</p>}
      {current && <div className={styles.report} aria-busy={loading}>
        <div className={styles.total}>
          <strong>{current.pendingDistances ? "Total parcial" : "Total apurado"} {money(current.totalCents)}</strong>
          {current.pendingDistances > 0 && <span>{current.pendingDistances} entrega(s) com distância pendente</span>}
        </div>
        {current.drivers.length === 0 && <p>Nenhum entregador para este dia.</p>}
        {current.drivers.map(driver => <article className={styles.driver} key={driver.id}>
          <div className={styles.total}><h3>{driver.name}</h3><strong>{money(driver.totalCents)}{driver.pendingDistances > 0 && " parcial"}</strong></div>
          <p>{driver.deliveries.length} concluída(s) · Arrancada {money(driver.baseCents)} · {driver.extraDeliveries} extra(s) {money(driver.extraCents)} · Quilometragem {money(driver.distanceCents)}</p>
          {driver.deliveries.length === 0 && <button type="button" className={queue.secondary} disabled={loading || busy}
            onClick={() => void apply({ type: "confirmShift", day, driverId: driver.id, confirmed: !driver.confirmed })}>
            {driver.confirmed ? "Desmarcar turno confirmado" : "Confirmar turno sem entregas"}
          </button>}
          {driver.deliveries.length > 0 && <details>
            <summary>Conferir entregas{driver.pendingDistances > 0 && ` · ${driver.pendingDistances} pendente(s)`}</summary>
            <ul className={styles.deliveries}>{driver.deliveries.map(delivery => <li key={delivery.id}>
              <span>#{delivery.id.slice(0, 8).toUpperCase()} · {delivery.sequence}ª entrega · {delivery.brand}</span>
              {delivery.distanceMeters === null ? <button type="button" className={queue.secondary} disabled={loading || busy}
                onClick={() => void apply({ type: "measureDistance", orderId: delivery.id })}>Medir distância</button> :
                <span>{km.format(delivery.distanceMeters / 1000)} km · adicional {money((delivery.distanceBonusCents ?? 0) + delivery.extraCents)}</span>}
            </li>)}</ul>
          </details>}
        </article>)}
      </div>}
    </div>}
  </details>;
}
