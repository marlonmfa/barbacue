"use client";

import { useEffect, useState } from "react";
import { FinanceiroView } from "./FinanceiroView";
import styles from "./financeiro.module.css";
import type { FinanceReport } from "@/lib/financeiro/engine";

export default function FinanceiroPage() {
  const [report, setReport] = useState<FinanceReport>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch("/api/admin/financeiro", { cache: "no-store", signal: controller.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Não foi possível carregar o financeiro.");
        }
        setReport(await res.json());
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Falha de conexão.");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  if (report) return <FinanceiroView {...report} />;

  return (
    <section className={styles.page}>
      <header className={styles.header}><h1>Relatórios financeiros</h1></header>
      {error ? (
        <div className={styles.alert} role="alert">
          <p>{error}</p>
          <button onClick={() => { setError(""); setAttempt((attempt) => attempt + 1); }}>Tentar novamente</button>
        </div>
      ) : <p role="status">Consultando vendas e lançamentos…</p>}
    </section>
  );
}
