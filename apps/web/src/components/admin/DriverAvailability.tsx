"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./OperationalQueue.module.css";

export function DriverAvailability() {
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const desired = useRef(false);
  const pending = useRef(false);
  const action = useRef<(available: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    async function update(available: boolean) {
      if (pending.current) return;
      pending.current = true;
      if (mounted) setBusy(true);
      try {
        const response = await fetch("/api/admin/delivery/presence", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível confirmar sua disponibilidade.");
        if (mounted) { desired.current = data.online; setOnline(data.online); setError(""); }
      } catch (cause) {
        if (mounted) { setOnline(false); setError(cause instanceof Error ? cause.message : "Confira a conexão."); }
      } finally { pending.current = false; if (mounted) setBusy(false); }
    }
    action.current = update;
    void fetch("/api/admin/delivery/presence", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Não foi possível consultar sua disponibilidade. Tente novamente.");
      const data = await response.json();
      if (mounted) { desired.current = data.online; setOnline(data.online); }
    }).catch(cause => { if (mounted) setError(cause.message); }).finally(() => { if (mounted) setLoading(false); });
    const heartbeat = () => { if (desired.current && document.visibilityState === "visible") void update(true); };
    const timer = window.setInterval(heartbeat, 25_000);
    document.addEventListener("visibilitychange", heartbeat);
    window.addEventListener("online", heartbeat);
    return () => { mounted = false; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", heartbeat); window.removeEventListener("online", heartbeat); };
  }, []);
  return <section className={styles.availability} aria-label="Disponibilidade para entregas">
    <div><strong>{online ? "Você está online para novas entregas" : "Você está offline para novas entregas"}</strong><p>Mantenha esta tela aberta durante o turno. Sem conexão ou atividade por 90 segundos, você deixa de aparecer online. Suas entregas atribuídas continuam disponíveis.</p>{error && <p role="alert">{error}</p>}</div>
    <button className={styles.secondary} disabled={loading || busy} aria-pressed={online} onClick={() => { const next = !online; desired.current = next; void action.current(next); }}>{loading ? "Consultando…" : busy ? "Confirmando…" : online ? "Ficar offline" : "Ficar online"}</button>
  </section>;
}
