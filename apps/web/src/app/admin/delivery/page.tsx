"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";
import styles from "@/components/admin/OperationalQueue.module.css";

type Delivery = {
  id: string; brand: string; customerName: string; customerPhone: string; deliveryAddress: string | null;
  deliveryFeeCents: number; deliveryDistanceMeters: number | null; deliveryDurationSeconds: number | null;
  totalCents: number; amountToCollectCents: number; paymentMethod: string | null; paymentStatus: string | null; changeForCents: number | null;
  itemCount: number; notes: string | null; status: string; deliveryStatus: "assigned" | "out_for_delivery" | "delivered";
  navigationLinks: { google: string; apple: string; osm: string | null } | null;
  createdAt: string | null; dispatchedAt: string | null; deliveredAt: string | null;
};
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const paymentLabels: Record<string, string> = { cash: "Dinheiro", card_on_delivery: "Cartão", pix: "Pix" };

export default function DeliveryPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/delivery", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível atualizar suas entregas.");
      setDeliveries(data); setError("");
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void load(controller.signal), 0);
    const timer = window.setInterval(() => void load(controller.signal), 15_000);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);
  async function advance(delivery: Delivery) {
    if (busy) return;
    setBusy(delivery.id); setError(""); setNotice("");
    const deliveryStatus = delivery.deliveryStatus === "assigned" ? "out_for_delivery" : "delivered";
    try {
      const response = await fetch("/api/admin/delivery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: delivery.id, deliveryStatus }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar esta etapa.");
      setNotice(deliveryStatus === "delivered" ? `Entrega #${delivery.id.slice(0, 8).toUpperCase()} concluída.` : "Saída registrada. Boa entrega!");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente."); }
    finally { setBusy(null); }
  }
  const active = deliveries.filter(delivery => delivery.deliveryStatus !== "delivered");
  const done = deliveries.filter(delivery => delivery.deliveryStatus === "delivered");
  const visible = completed ? done : active;

  return <div className={`${styles.page} ${styles.driverPage}`}>
    <header className={styles.heading}><div><h1>Minhas entregas</h1><p>Confira a retirada, abra a rota e registre a entrega.</p></div><button className={styles.secondary} onClick={() => void load()}><AdminIcon name="clock" /> Atualizar</button></header>
    <div className={styles.filters} aria-label="Filtrar minhas entregas"><button aria-pressed={!completed} onClick={() => setCompleted(false)}>Em andamento <span>{active.length}</span></button><button aria-pressed={completed} onClick={() => setCompleted(true)}>Concluídas <span>{done.length}</span></button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading ? <p className={styles.empty}>Carregando suas entregas…</p> : !visible.length ? <div className={styles.empty}><AdminIcon name="delivery" size={40} /><h2>{completed ? "Nenhuma entrega concluída nas últimas 24 horas" : "Nenhuma entrega atribuída a você"}</h2><p>{completed ? "As entregas que você concluir ficam aqui por 24 horas." : "Quando o caixa atribuir uma entrega, ela aparece aqui."}</p></div> : <div className={styles.deliveries}>{visible.map(delivery => <article className={styles.delivery} key={delivery.id}>
      <header className={styles.deliveryHeading}><div><span className={`${styles.badge} ${delivery.deliveryStatus === "out_for_delivery" || delivery.status === "ready" ? styles.ready : ""}`}>{delivery.deliveryStatus === "delivered" ? "Entrega concluída" : delivery.deliveryStatus === "out_for_delivery" ? "Em entrega" : delivery.status === "ready" ? "Pronto para retirar" : delivery.status === "pending" ? "Aguardando confirmação" : "Aguardando a cozinha"}</span><h2>Pedido #{delivery.id.slice(0, 8).toUpperCase()}</h2><p>{delivery.brand} · {delivery.itemCount} {delivery.itemCount === 1 ? "item" : "itens"}</p></div><AdminIcon name="delivery" size={30} /></header>
      <div className={styles.destination}><h3>{delivery.customerName || "Cliente"}</h3><p>{delivery.deliveryAddress || "Endereço não informado. Confira com o caixa."}</p>{delivery.customerPhone && <a className={styles.phone} href={`tel:${delivery.customerPhone.replace(/[^+\d]/g, "")}`}>Ligar: {delivery.customerPhone}</a>}</div>
      {!!delivery.deliveryDistanceMeters && <p className={styles.routeMeta}>Trajeto estimado: {(delivery.deliveryDistanceMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km{delivery.deliveryDurationSeconds ? ` · ${Math.ceil(delivery.deliveryDurationSeconds / 60)} min` : ""}</p>}
      {delivery.navigationLinks && <nav className={styles.routeLinks} aria-label={`Abrir rota do pedido ${delivery.id.slice(0, 8)}`}><a href={delivery.navigationLinks.google} target="_blank" rel="noopener noreferrer"><AdminIcon name="route" size={18} /> Google Maps</a><a href={delivery.navigationLinks.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>{delivery.navigationLinks.osm && <a href={delivery.navigationLinks.osm} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>}</nav>}
      {delivery.notes && <p className={styles.notes}><strong>Observação do pedido:</strong> {delivery.notes}</p>}
      <div className={styles.collection}><div><span>{delivery.paymentStatus === "paid" ? "Pagamento recebido" : "Valor a cobrar"}</span><strong>{money(delivery.amountToCollectCents)}</strong></div><p>{paymentLabels[delivery.paymentMethod ?? ""] ?? "Confira com o caixa"}{delivery.paymentStatus === "paid" ? " · Pago" : " · Pagamento pendente"}</p><small>Total {money(delivery.totalCents)}, com frete de {money(delivery.deliveryFeeCents)} incluído.</small>{delivery.paymentMethod === "cash" && !!delivery.changeForCents && delivery.paymentStatus !== "paid" && <p>Troco para {money(delivery.changeForCents)}: <b>{money(Math.max(0, delivery.changeForCents - delivery.totalCents))}</b></p>}</div>
      {delivery.deliveryStatus !== "delivered" && <><button className={styles.primary} disabled={busy !== null || delivery.status !== "ready"} onClick={() => void advance(delivery)}><AdminIcon name={delivery.deliveryStatus === "assigned" ? "delivery" : "check"} />{busy === delivery.id ? "Registrando…" : delivery.deliveryStatus === "assigned" ? "Iniciar entrega" : "Concluir entrega"}</button><p className={styles.actionHint}>{delivery.status !== "ready" ? "A saída fica disponível quando a cozinha marcar o pedido como pronto." : delivery.deliveryStatus === "assigned" ? "Registre a saída após retirar o pedido com a equipe." : "Conclua após entregar ao cliente. O caixa confirma o pagamento."}</p></>}
    </article>)}</div>}
  </div>;
}
