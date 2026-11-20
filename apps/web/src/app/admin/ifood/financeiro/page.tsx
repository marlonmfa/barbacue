"use client";

import Link from "next/link";
import Reconciliation from "./reconciliation";
import { useEffect, useState } from "react";
import type { IfoodFinancialRow, IfoodFinancialSection } from "@/lib/ifood-financial";

type Store = { id: string; name: string };
type Report = { rows: IfoodFinancialRow[]; hasNextPage: boolean };

const sections = { sales: "Vendas", settlements: "Repasses", events: "Lançamentos", anticipations: "Antecipações", reconciliation: "Conciliação sob demanda" } as const;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const control = "min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm";
const date = (value: string | null) => value ? value.split("-").reverse().join("/") : "—";

const formatMoney = (value: number | null | undefined) => value == null ? "—" : money.format(value);

function periodDay(offset: number) {
  return new Date(Date.now() - offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function read<T>(query: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/admin/ifood/financial${query}`, { cache: "no-store", signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.error || "Falha ao consultar o financeiro do iFood.");
  return body;
}

export default function IfoodFinancial() {
  const [stores, setStores] = useState<Store[]>([]);
  const [store, setStore] = useState("");
  const [section, setSection] = useState<IfoodFinancialSection | "reconciliation">("sales")
  const [dateBasis, setDateBasis] = useState("payment");
  const [from, setFrom] = useState(() => periodDay(6));
  const [to, setTo] = useState(() => periodDay(0));
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Report | null>(null);
  const [storeError, setStoreError] = useState("");
  const [reportError, setReportError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    read<{ stores: Store[] }>("", controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setStores(data.stores);
      setStore(data.stores[0]?.id ?? "");
    }).catch(error => {
      if (!controller.signal.aborted) setStoreError(error.message);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!store || !from || !to || section === "reconciliation") return;
    const controller = new AbortController();
    const query = new URLSearchParams({ store, section, from, to, dateBasis, page: String(page) });
    setResult(null);
    setReportError("");
    setLoading(true);
    read<Report>(`?${query}`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(error => { if (!controller.signal.aborted) setReportError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [store, section, from, to, page, refresh, dateBasis]);

  return (
    <div>
      <Link href="/admin/ifood" className="text-sm text-[var(--brand-copy)]">Voltar ao Gestor iFood</Link>
      <h1 className="mt-3 text-2xl font-bold">Financeiro do iFood</h1>
      {stores.length > 0 && (
        <div className="my-5 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">Loja
            <select className={control} value={store} onChange={e => { setStore(e.target.value); setPage(1); }}>
              {stores.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Consulta
            <select className={control} value={section} onChange={e => { setSection(e.target.value as IfoodFinancialSection | "reconciliation"); setPage(1); }}>
              {Object.entries(sections).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
            </select>
          </label>
          {section === "anticipations" && (
            <label className="grid gap-1 text-sm">Filtrar por
              <select className={control} value={dateBasis} onChange={e => setDateBasis(e.target.value)}>
                <option value="payment">Data antecipada</option>
                <option value="calculation">Data de cálculo</option>
              </select>
            </label>
          )}
          {section !== "reconciliation" && <>
          <label className="grid gap-1 text-sm">De
            <input className={control} type="date" value={from} max={to} onChange={e => { if (e.target.value) setFrom(e.target.value); setPage(1); }} />
          </label>
          <label className="grid gap-1 text-sm">Até
            <input className={control} type="date" value={to} min={from} onChange={e => { if (e.target.value) setTo(e.target.value); setPage(1); }} />
          </label>
          <button className={control} disabled={loading} onClick={() => setRefresh(x => x + 1)}>Atualizar</button>
          </>}
        </div>
      )}
      {section === "reconciliation" && store && <Reconciliation key={store} store={store} />}
      {section !== "reconciliation" && <>
      {(storeError || reportError) && <p className="my-4 text-[var(--danger)]" role="alert">{storeError || reportError}</p>}
      {loading && <p role="status">Consultando o iFood…</p>}
      {result && <>
        {result.rows.length === 0 ? <p>Sem registros neste período.</p> : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-left text-sm">
              <thead><tr>
                <th className="p-3">Data</th>
                <th className="p-3">{section === "sales" ? "Pedido" : "Tipo"}</th>
                <th className="p-3">{section === "events" ? "Origem" : "Situação"}</th>
                {section === "events" && <><th className="p-3">Repasse previsto</th><th className="p-3">Impacta o repasse</th></>}
                <th className="p-3 text-right">{section === "sales" ? "Valor bruto" : "Valor"}</th>
                {section === "sales" && <th className="p-3 text-right">Saldo informado</th>}
                {section === "anticipations" && <><th className="p-3">Data original</th><th className="p-3 text-right">Valor original</th><th className="p-3 text-right">Tarifa</th></>}
              </tr></thead>
              <tbody>{result.rows.map((row, index) => (
                <tr key={index} className="border-t border-[var(--border)]">
                  <td className="whitespace-nowrap p-3">{date(row.date)}</td>
                  <td className="p-3">{row.description}</td>
                  <td className="p-3">{row.status ?? "—"}</td>
                  {section === "events" && <>
                    <td className="whitespace-nowrap p-3">{date(row.expectedDate ?? null)}</td>
                    <td className="p-3">{row.impactsTransfer == null ? "—" : row.impactsTransfer ? "Sim" : "Não"}</td>
                  </>}
                  <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatMoney(row.amount)}</td>
                  {section === "sales" && <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatMoney(row.balance)}</td>}
                  {section === "anticipations" && <>
                    <td className="p-3">{date(row.expectedDate ?? null)}</td>
                    <td className="p-3 text-right">{formatMoney(row.balance)}</td>
                    <td className="p-3 text-right">{formatMoney(row.feeAmount)}{row.feePercentage == null ? "" : ` · ${row.feePercentage.toLocaleString("pt-BR")}%`}</td>
                  </>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {(page > 1 || result.hasNextPage) && (
          <nav aria-label="Páginas do relatório" className="mt-4 flex items-center gap-3 text-sm">
            <button className={control} disabled={page === 1} onClick={() => setPage(n => n - 1)}>Anterior</button>
            <span>Página {page}</span>
            <button className={control} disabled={!result.hasNextPage} onClick={() => setPage(n => n + 1)}>Próxima</button>
          </nav>
        )}
      </>}
      </>}
    </div>
  );
}
