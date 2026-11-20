"use client";
import { useEffect, useState } from "react";
import styles from "@/components/admin/Access.module.css";
import { KitchenPrinting } from "@/components/admin/KitchenPrinting";
type Ticket = { id: string; brand: string; items: { name: string; qty: number; notes?: string | null }[]; notes: string | null; status: "confirmed" | "preparing" | "ready"; tableNumber?: number | null; orderType?: string; channel?: string | null; customerName?: string | null };
const labels = { confirmed: "A preparar", preparing: "Em preparo", ready: "Pronto para sair" };
export default function KitchenPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [requested, setRequested] = useState<Record<string, number>>({});
  async function load() {
    try { const res = await fetch("/api/admin/kitchen", { cache: "no-store" }); if (!res.ok) throw new Error(); setTickets(await res.json()); setError(""); }
    catch { setError("Não foi possível atualizar a fila. Tente novamente."); } finally { setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => fetch("/api/admin/kitchen", { cache: "no-store", signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error();
      return res.json();
    }).then(data => { setTickets(data); setLoading(false); setError(""); }).catch(() => {
      if (!controller.signal.aborted) { setError("Não foi possível atualizar a fila. Tente novamente."); setLoading(false); }
    });
    void refresh(); const timer = setInterval(() => void refresh(), 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  async function advance(ticket: Ticket, status: "preparing" | "ready") {
    setBusy(ticket.id);
    setError("");
    try {
      const response = await fetch("/api/admin/kitchen", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ticket.id, status }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Não foi possível salvar o preparo.");
      }
      if (response.status === 202) {
        setRequested(entries => ({ ...entries, [`${ticket.id}:${status}`]: Date.now() + 60_000 }));
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o preparo."); }
    finally { setBusy(null); }
  }

  function stageButton(ticket: Ticket, status: "preparing" | "ready") {
    const pending = (requested[`${ticket.id}:${status}`] ?? 0) > Date.now();
    return <button className={styles.primary} disabled={busy !== null || pending} onClick={() => void advance(ticket, status)}>
      {busy === ticket.id ? "Salvando…" : pending ? "Aguardando iFood…" : status === "preparing" ? "Iniciar preparo" : "Marcar como pronto"}
    </button>;
  }

  return <div className={styles.page}><header className={styles.head}><div><h1>Cozinha</h1><p>Confira os itens, inicie o preparo e avise quando estiver pronto.</p></div><button className={styles.secondary} onClick={() => void load()}>Atualizar fila</button></header><KitchenPrinting />{error && <p role="alert" className={styles.error}>{error}</p>}{loading ? <p>Carregando pedidos…</p> : !tickets.length ? <div className={styles.panel}><p className={styles.empty}>Nenhum pedido na cozinha agora. Novos pedidos confirmados aparecem aqui automaticamente.</p></div> : <div className={styles.work}>{tickets.map(t => <article key={t.id} className={styles.ticket}><span className={styles.tag}>{labels[t.status]}</span><h2 className="mt-4">Pedido {t.id.slice(0, 8)}</h2><p>{t.brand}{t.tableNumber ? ` · Mesa ${t.tableNumber}` : t.orderType === "pickup" ? " · Retirada no balcão" : ""}</p>{t.orderType === "pickup" && t.customerName && <p><strong>{t.customerName}</strong></p>}<ul>{t.items.map((item, i) => <li key={i}><strong>{item.qty}×</strong> {item.name}{item.notes && <p><strong>Observação:</strong> {item.notes}</p>}</li>)}</ul>{t.notes && <p><strong>Observações: </strong>{t.notes}</p>}{t.status === "confirmed" && stageButton(t, "preparing")}{(t.status === "preparing" || (t.channel === "ifood" && t.status === "confirmed")) && stageButton(t, "ready")}</article>)}</div>}</div>;
}
