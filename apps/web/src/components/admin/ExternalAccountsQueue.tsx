"use client";
import { useCallback, useEffect, useState } from "react";
import { externalCategories, type ExternalAccount } from "@/lib/external-account-categories";
const money = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const endpoint = "/api/admin/erp/external-accounts";
export default function ExternalAccountsQueue() {
  const [rows, setRows] = useState<ExternalAccount[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState<ExternalAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch(endpoint); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.rows); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar fila."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, category: selected.category || selected.suggestion, status: selected.status || "pending", identity: selected.identity || "", notes: selected.notes || "", version: selected.version || 0 }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSelected(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setSaving(false); }
  }
  const filtered = rows.filter(r => (status === "all" || (status === "open" ? r.status !== "confirmed" : r.status === status)) && `${r.name} ${r.document} ${r.banks} ${r.category || r.suggestion}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section>
    <h2>Identificação de contas externas</h2>
    <p>Revise o beneficiário, o vínculo com a empresa e a categoria. Prioridade por incerteza, valor e recorrência. Sugestões aguardam confirmação documental.</p>
    <p>{rows.length} itens no total · {rows.filter(r => r.status !== "confirmed").length} pendentes · {rows.filter(r => r.status === "confirmed").length} confirmados</p>
    <label>Buscar recebedor, documento ou categoria <input value={query} onChange={e => setQuery(e.target.value)} /></label>{" "}
    <label>Situação <select value={status} onChange={e => setStatus(e.target.value)}><option value="open">Pendentes e em investigação</option><option value="investigating">Em investigação</option><option value="confirmed">Confirmados</option><option value="all">Todos</option></select></label>{" "}
    <button onClick={() => void load()} disabled={loading || saving}>Atualizar</button>
    {error && <p role="alert">{error}</p>}
    {loading ? <p>Carregando fila…</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left" }}><thead><tr>{["Prioridade", "Recebedor", "Totais por fonte", "Sugestão / classificação", "Situação", "Revisão"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {filtered.map(r => <tr key={r.id}>
        <td>P{r.priority}<br /><small>{r.reason}</small></td>
        <td>{r.identity || r.name}<br /><small>{r.document || "Documento a identificar"}<br />{r.companies}<br />{r.banks}</small></td>
        <td>Extratos: {money(r.bankCents)}<br />Stone: {money(r.stoneCents)}<br />Comprovantes: {money(r.receiptCents)}<br /><small>{r.count} movimentos/documentos · fontes não aditivas</small></td>
        <td>{r.category || r.suggestion}<br /><small>{r.category ? "Classificação revisada" : `Sugestão: ${r.confidence}`}</small></td>
        <td>{r.status === "confirmed" ? "Confirmado" : r.status === "investigating" ? "Em investigação" : "Pendente"}</td>
        <td><button onClick={() => setSelected({ ...r, category: r.category || r.suggestion, status: r.status || "pending" })}>Identificar / classificar</button></td>
      </tr>)}
    </tbody></table>{!filtered.length && <p>Nenhum item neste filtro.</p>}</div>}
    {selected && <div role="dialog" aria-modal="true" aria-label="Classificar conta externa" style={{ position: "fixed", inset: "5%", zIndex: 100, overflow: "auto", padding: 24, background: "#fff", color: "#181818", boxShadow: "0 0 0 100vmax #0009", borderRadius: 12 }}>
      <h3>{selected.name}</h3>
      <p>Identifique o destino e registre a evidência que justifica a classificação. CLT e PJ exigem comprovação do vínculo.</p>
      <label>Recebedor / titular identificado<input style={{ display: "block", width: "100%" }} value={selected.identity || ""} maxLength={400} onChange={e => setSelected({ ...selected, identity: e.target.value })} /></label>
      <label>Categoria<select style={{ display: "block", width: "100%" }} value={selected.category} onChange={e => setSelected({ ...selected, category: e.target.value })}>{externalCategories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Situação<select style={{ display: "block" }} value={selected.status} onChange={e => setSelected({ ...selected, status: e.target.value })}><option value="pending">Pendente</option><option value="investigating">Em investigação</option><option value="confirmed">Confirmado com evidência</option></select></label>
      <label>Evidência, dúvidas e observações<textarea style={{ display: "block", width: "100%", minHeight: 120 }} value={selected.notes || ""} maxLength={4000} onChange={e => setSelected({ ...selected, notes: e.target.value })} /></label>
      {error && <p role="alert">{error}</p>}
      <button disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar revisão"}</button>{" "}<button disabled={saving} onClick={() => setSelected(null)}>Cancelar</button>
    </div>}
  </section>;
}
