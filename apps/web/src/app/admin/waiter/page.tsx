"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";
import styles from "@/components/admin/OperationalQueue.module.css";

type Table = { id: number; number: number; label: string | null; token: string };
type FloorOrder = { id: string; brand: string; tableId: number | null; tableNumber: number | null; items: { name: string; qty: number; notes: string | null }[]; notes: string | null; status: "pending" | "confirmed" | "preparing" | "ready"; createdAt: string | null };
const labels = { pending: "Aguardando confirmação", confirmed: "Na fila da cozinha", preparing: "Em preparo", ready: "Pronto para servir" };

export default function WaiterPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<FloorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/waiter", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível atualizar o salão.");
      setTables(data.tables); setOrders(data.orders); setError("");
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o salão.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void load(controller.signal), 0);
    const timer = window.setInterval(() => void load(controller.signal), 15_000);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  async function serve(order: FloorOrder) {
    if (busy) return;
    setBusy(order.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/waiter", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, status: "delivered" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar o pedido servido.");
      setNotice(`Pedido ${order.id.slice(0, 8).toUpperCase()} marcado como servido${order.tableNumber ? ` na mesa ${order.tableNumber}` : ""}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente."); }
    finally { setBusy(null); }
  }
  const ready = orders.filter(order => order.status === "ready").length;
  const grouped = new Map<number | null, { table: Table | null; number: number | null; orders: FloorOrder[] }>();
  tables.forEach(table => grouped.set(table.id, { table, number: table.number, orders: [] }));
  orders.forEach(order => {
    if (!grouped.has(order.tableId)) grouped.set(order.tableId, { table: null, number: order.tableNumber, orders: [] });
    grouped.get(order.tableId)!.orders.push(order);
  });
  const groups = [...grouped.values()].filter(group => !readyOnly || group.orders.some(order => order.status === "ready"));

  return <div className={styles.page}>
    <header className={styles.heading}><div><h1>Salão</h1><p>Acompanhe cada mesa e leve os pedidos prontos para servir.</p></div><button className={styles.secondary} onClick={() => void load()}><AdminIcon name="clock" /> Atualizar salão</button></header>
    <div className={styles.summary}><div><strong>{tables.length}</strong><span>mesas ativas</span></div><div><strong>{orders.length}</strong><span>pedidos em andamento</span></div><div className={ready ? styles.highlight : ""}><strong>{ready}</strong><span>prontos para servir</span></div></div>
    <div className={styles.filters} aria-label="Filtrar pedidos do salão"><button aria-pressed={!readyOnly} onClick={() => setReadyOnly(false)}>Todas as mesas</button><button aria-pressed={readyOnly} onClick={() => setReadyOnly(true)}>Prontos para servir <span>{ready}</span></button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading ? <p className={styles.empty}>Carregando o salão…</p> : !groups.length ? <div className={styles.empty}><AdminIcon name="tables" size={36} /><h2>{readyOnly ? "Nenhum pedido pronto para servir" : "Nenhuma mesa cadastrada"}</h2><p>{readyOnly ? "Os pedidos aparecem aqui quando a cozinha terminar o preparo." : "Peça ao caixa ou ao gerente para cadastrar as mesas."}</p></div> : <div className={styles.tables}>{groups.map(group => <section className={styles.table} key={group.table?.id ?? `inactive-${group.number ?? "unknown"}`}>
      <header className={styles.tableHeading}><div><h2>{group.number ? `Mesa ${group.number}` : "Sem mesa vinculada"}</h2>{group.table?.label && <p>{group.table.label}</p>}</div>{group.table && <a className={styles.tableOrder} href={`/totem?mesa=${encodeURIComponent(group.table.token)}`} target="_blank" rel="noopener noreferrer" aria-label={`Novo pedido para mesa ${group.number}`}><AdminIcon name="plus" /> Novo pedido</a>}</header>
      {!group.orders.length ? <p className={styles.emptyTable}>Sem pedidos em preparo.</p> : group.orders.filter(order => !readyOnly || order.status === "ready").map(order => <article className={styles.floorOrder} key={order.id}>
        <div className={styles.orderHeading}><span className={`${styles.badge} ${order.status === "ready" ? styles.ready : ""}`}>{labels[order.status]}</span><small>#{order.id.slice(0, 8).toUpperCase()}</small></div>
        <p className={styles.orderMeta}>{order.brand}{order.createdAt ? ` · ${new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}` : ""}</p>
        <ul className={styles.items}>{order.items.map((item, index) => <li key={index}><span><b>{item.qty}×</b> {item.name}</span>{item.notes && <small>{item.notes}</small>}</li>)}</ul>
        {order.notes && <p className={styles.notes}><strong>Observação:</strong> {order.notes}</p>}
        {order.status === "ready" && <button className={styles.primary} disabled={busy !== null} onClick={() => void serve(order)}><AdminIcon name="check" />{busy === order.id ? "Registrando…" : "Marcar como servido"}</button>}
      </article>)}
    </section>)}</div>}
  </div>;
}
