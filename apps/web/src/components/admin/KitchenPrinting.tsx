"use client";

import { useEffect, useState } from "react";
import styles from "./Access.module.css";

type Job = {
  id: string; orderId: string; orderNumber: string; tableNumber: number | null;
  status: "queued" | "printing" | "printed" | "failed" | "uncertain";
  attempts: number; lastError: string | null;
};
type Queue = { configured: boolean; online: boolean; lastSeenAt: string | null; totalPending: number; jobs: Job[] };
const labels: Record<Job["status"], string> = {
  queued: "Na fila", printing: "Enviando", printed: "Enviado à impressora",
  failed: "Falha no envio", uncertain: "Conferir impressão",
};
async function fetchQueue(signal?: AbortSignal): Promise<Queue> {
  const res = await fetch("/api/admin/kitchen/printing", { cache: "no-store", signal });
  if (!res.ok) throw new Error("Não foi possível consultar a impressão.");
  return res.json();
}

export function KitchenPrinting() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    try {
      setQueue(await fetchQueue(signal));
      setError("");
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Não foi possível consultar a impressão.");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => fetchQueue(controller.signal).then(data => {
      if (!controller.signal.aborted) { setQueue(data); setError(""); }
    }).catch(() => {
      if (!controller.signal.aborted) setError("Não foi possível consultar a impressão.");
    });
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  async function retry(job: Job) {
    if (!window.confirm(`Confira o papel do pedido ${job.orderNumber} antes de reenviar. Ele pode já ter sido impresso. Deseja enviar uma via marcada como reimpressão?`)) return;
    setBusy(job.id);
    try {
      const res = await fetch("/api/admin/kitchen/printing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, acknowledgePossibleDuplicate: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? data.error ?? "Não foi possível reenviar.");
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível reenviar."); }
    finally { setBusy(null); }
  }

  const pending = queue?.jobs.filter(j => j.status !== "printed") ?? [];
  return <section className={styles.form} aria-label="Impressão da cozinha">
    <div className={styles.head}>
      <div>
        <h2>Impressão da cozinha</h2>
        <p>{!queue ? "Consultando conexão…" : !queue.configured ? "Configure o agente de impressão no computador da cozinha. Os pedidos ficam guardados na fila." : queue.online ? "Agente conectado. Novos pedidos das origens integradas entram na fila automaticamente." : "Agente sem conexão recente. Verifique o computador da cozinha; os pedidos continuam na fila."}</p>
        {queue?.lastSeenAt && <p>Último contato: {new Date(queue.lastSeenAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>}
      </div>
      <button className={styles.secondary} onClick={() => void load()}>Atualizar impressão</button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {queue && <p>{queue.totalPending} pedido(s) aguardando envio ou conferência. O envio confirmado pelo computador não comprova a saída do papel.</p>}
    {!!pending.length && <details open={pending.some(job => job.status === "failed" || job.status === "uncertain")}>
      <summary className="mt-3 cursor-pointer py-3">Ver fila de impressão ({queue?.totalPending})</summary>
      <div className={styles.work}>{pending.map(job => <article className={styles.ticket} key={job.id}>
      <span className={styles.tag}>{labels[job.status]}</span>
      <h3 className="mt-3 font-semibold">Pedido {job.orderNumber}{job.tableNumber ? ` · Mesa ${job.tableNumber}` : ""}</h3>
      {job.lastError && <p>{job.lastError}</p>}
      {(job.status === "failed" || job.status === "uncertain") && <button disabled={busy !== null} className={`${styles.secondary} mt-3`} onClick={() => void retry(job)}>{busy === job.id ? "Reenviando…" : "Conferir e reenviar"}</button>}
    </article>)}</div></details>}
  </section>;
}
