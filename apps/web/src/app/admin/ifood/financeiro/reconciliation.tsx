"use client";

import { useEffect, useState } from "react";
import type { IfoodReconciliation } from "@/lib/ifood-financial";

const endpoint = "/api/admin/ifood/financial";
const control = "min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm";
const previousMonth = () => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date()).split("-");
  return new Date(Date.UTC(Number(year), Number(month) - 2, 1)).toISOString().slice(0, 7);
};

export default function Reconciliation({ store }: { store: string }) {
  const [competence, setCompetence] = useState(previousMonth);
  const [input, setInput] = useState("");
  const [requestId, setRequestId] = useState("");
  const [report, setReport] = useState<IfoodReconciliation | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const cacheKey = `ifood-reconciliation:${store}:${competence}`;

  useEffect(() => {
    const saved = localStorage.getItem(cacheKey) ?? "";
    setInput(saved);
    setRequestId(saved);
    setReport(null);
    setError("");
  }, [cacheKey]);

  useEffect(() => {
    if (!requestId) return;
    const abort = new AbortController();
    const query = new URLSearchParams({ section: "reconciliation", store, competence, requestId });
    let timeout: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const response = await fetch(`${endpoint}?${query}`, { cache: "no-store", signal: abort.signal });
        const data = await response.json();
        if (abort.signal.aborted) return;
        if (response.ok) {
          setReport(data);
          setError("");
          if (data.status === "processed" || data.status === "error") return;
        } else if (![404, 429, 502, 503].includes(response.status)) {
          setError(data.error ?? "Falha ao consultar o protocolo.");
          return;
        }
      } catch {
        if (abort.signal.aborted) return;
      }
      if (++attempts < 12) {
        timeout = setTimeout(() => void poll(), Math.min(20_000, 1500 * 2 ** attempts));
      } else {
        setError("O arquivo ainda está indisponível. Consulte o protocolo novamente em alguns minutos.");
      }
    }
    void poll();
    return () => { abort.abort(); clearTimeout(timeout); };
  }, [store, competence, requestId]);

  async function requestReport() {
    setGenerating(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, competence }), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (response.status === 409) throw new Error("Já existe uma solicitação recente no iFood. Consulte o protocolo original ou tente novamente mais tarde.");
      if (!response.ok) throw new Error(data.error ?? "Falha ao solicitar o arquivo.");
      localStorage.setItem(cacheKey, data.requestId);
      setInput(data.requestId);
      setReport(data);
      setRequestId(data.requestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao solicitar o arquivo.");
    } finally {
      setGenerating(false);
    }
  }

  return <section>
    <h2 className="mb-3 text-lg font-semibold">Arquivo de conciliação do iFood</h2>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Competência
        <input className={control} type="month" value={competence} disabled={generating} onChange={e => setCompetence(e.target.value)} />
      </label>
      <button className={control} disabled={generating || !competence} onClick={() => void requestReport()}>Solicitar arquivo</button>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        const value = input.trim();
        if (!value) return;
        setError("");
        setReport(null);
        setRequestId("");
        window.setTimeout(() => setRequestId(value), 0);
      }}>
        <label className="grid gap-1 text-sm">Protocolo
          <input className={control} value={input} maxLength={100} onChange={e => setInput(e.target.value)} />
        </label>
        <button className={control} disabled={generating || !input.trim()}>Consultar protocolo</button>
      </form>
    </div>
    {error && <p role="alert" className="mt-4 text-[var(--danger)]">{error}</p>}
    {generating && <p role="status" className="mt-4">Solicitando arquivo…</p>}
    {requestId && !error && report?.status !== "processed" && report?.status !== "error" && <p role="status" className="mt-4">Aguardando processamento no iFood…</p>}
    {report?.status === "error" && <p role="alert" className="mt-4">{report.message}</p>}
    {report?.status === "processed" && report.downloadUrl && (
      <a className="mt-4 inline-flex text-[var(--brand-copy)] underline" href={report.downloadUrl} target="_blank" rel="noopener noreferrer">Baixar arquivo de conciliação</a>
    )}
  </section>;
}
