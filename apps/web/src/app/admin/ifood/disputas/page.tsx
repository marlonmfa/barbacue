"use client";

import { useState } from "react";
import { IfoodTabs, Notice, fmtR, sendJson, useIfoodJson, when } from "@/components/admin/ifood/IfoodTabs";
import { ACTION_LABEL, ALTERNATIVE_LABEL, type Dispute } from "@/lib/ifood-disputes";

interface Data { dryRun: boolean; stores: { id: string; name: string }[]; disputes: Dispute[]; deliveryCodes: { orderExternalId: string; brand: string | null; code: string; label: string; at: string }[] }
const STATUS: Record<Dispute["status"], string> = { open: "Aguardando resposta", answered: "Respondida", settled: "Resolvida pelo iFood", expired: "Expirada" };

export default function IfoodDisputes() {
  const { data, error, forbidden, reload } = useIfoodJson<Data>("/api/admin/ifood/disputes");
  const [busy, setBusy] = useState(""); const [notice, setNotice] = useState(""); const [fail, setFail] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const storeName = (id: string | null) => data?.stores.find(s => s.id === id)?.name ?? "Loja";

  async function answer(d: Dispute, body: Record<string, unknown>, label: string) {
    setBusy(d.disputeId); setFail(""); setNotice("");
    const r = await sendJson(`/api/admin/ifood/disputes/${encodeURIComponent(d.disputeId)}`, "POST", body);
    setBusy("");
    if (r.ok) { setNotice(`${label} enviado ao iFood.`); await reload(); } else setFail(r.error ?? "");
  }

  const open = data?.disputes.filter(d => d.status === "open") ?? [];
  const past = data?.disputes.filter(d => d.status !== "open") ?? [];
  return (
    <div>
      <IfoodTabs />
      <h1 className="text-2xl font-bold text-white mb-1">Disputas e código de entrega</h1>
      <p className="text-[#a89a8c] text-sm mb-4">Quando o cliente pede cancelamento ou reembolso depois do pedido, o iFood abre uma negociação com prazo. Responda antes de expirar; sem resposta, vale a ação automática indicada.</p>
      {data?.dryRun && <p className="mb-4 text-sm text-yellow-200">Modo simulação ativo: respostas não são enviadas ao iFood.</p>}
      <Notice error={error || fail} forbidden={forbidden} notice={notice} />
      <section className="mb-8">
        <h2 className="text-lg text-white font-semibold mb-3">Abertas ({open.length})</h2>
        {!open.length && <p className="text-[#a89a8c] text-sm">Nenhuma disputa aguardando resposta.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {open.map(d => (
            <article key={d.disputeId} className="rounded-2xl border border-[#ed1b24]/60 bg-[#1a1512] p-4">
              <header className="flex justify-between gap-2 mb-2"><strong className="text-white">{storeName(d.merchantId)} · pedido {d.orderExternalId.slice(0, 8)}</strong><span className="text-xs text-[#c8b89a]">expira {when(d.expiresAt)}</span></header>
              <p className="text-[#e8dccf] text-sm mb-1">{ACTION_LABEL[d.action ?? ""] ?? d.action ?? "Negociação"}</p>
              {d.message && <p className="text-[#a89a8c] text-sm mb-2">“{d.message}”</p>}
              {d.items.length > 0 && <ul className="text-xs text-[#a89a8c] mb-2">{d.items.map((i, k) => <li key={k}>{i.qty ? `${i.qty}× ` : ""}{i.name}</li>)}</ul>}
              {d.timeoutAction && <p className="text-xs text-[#a89a8c] mb-3">Sem resposta: {d.timeoutAction === "ACCEPT" ? "o iFood aceita" : d.timeoutAction === "REJECT" ? "o iFood recusa" : d.timeoutAction}</p>}
              <div className="flex flex-wrap gap-2 mb-3">
                <button disabled={busy === d.disputeId} onClick={() => void answer(d, { kind: "accept" }, "Aceite")} className="min-h-11 px-4 rounded-xl bg-green-600 text-white text-sm disabled:opacity-50">Aceitar</button>
                {d.alternatives.map(a => a.type === "ADDITIONAL_TIME"
                  ? <button key={a.id} disabled={busy === d.disputeId} onClick={() => void answer(d, { kind: "alternative", alternativeId: a.id, minutes: a.additionalTimes[0], timeReason: a.additionalTimeReasons[0] }, "Pedido de mais tempo")} className="min-h-11 px-4 rounded-xl bg-[#2a201b] border border-[#352b24] text-[#e8dccf] text-sm">{ALTERNATIVE_LABEL[a.type]} ({a.additionalTimes[0] ?? "?"} min)</button>
                  : <button key={a.id} disabled={busy === d.disputeId} onClick={() => void answer(d, { kind: "alternative", alternativeId: a.id, amountCents: a.maxAmountCents ?? undefined }, "Proposta")} className="min-h-11 px-4 rounded-xl bg-[#2a201b] border border-[#352b24] text-[#e8dccf] text-sm">{ALTERNATIVE_LABEL[a.type] ?? a.type} {a.maxAmountCents ? `até ${fmtR(a.maxAmountCents)}` : ""}</button>)}
              </div>
              <div className="flex gap-2">
                <input aria-label="Motivo da recusa" value={reason[d.disputeId] ?? ""} onChange={e => setReason(r => ({ ...r, [d.disputeId]: e.target.value }))} placeholder="Motivo da recusa" maxLength={250} className="flex-1 min-h-11 rounded-xl bg-[#0e0b0a] border border-[#352b24] px-3 text-sm text-white" />
                <button disabled={busy === d.disputeId || !(reason[d.disputeId] ?? "").trim()} onClick={() => void answer(d, { kind: "reject", reason: reason[d.disputeId] }, "Recusa")} className="min-h-11 px-4 rounded-xl bg-[#ed1b24] text-white text-sm disabled:opacity-50">Recusar</button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="mb-8">
        <h2 className="text-lg text-white font-semibold mb-3">Código de entrega</h2>
        <p className="text-[#a89a8c] text-sm mb-3">O entregador do iFood confirma a entrega com o código que o cliente recebe. Aqui aparece o andamento; a loja não precisa digitar o código.</p>
        {!data?.deliveryCodes.length ? <p className="text-[#a89a8c] text-sm">Nenhum evento nos últimos 7 dias.</p> :
          <ul className="divide-y divide-[#352b24] rounded-2xl border border-[#352b24] bg-[#1a1512]">{data.deliveryCodes.map(c => <li key={c.orderExternalId} className="flex justify-between gap-3 px-4 py-3 text-sm"><span className="text-[#e8dccf]">Pedido {c.orderExternalId.slice(0, 8)} · {c.label}</span><span className="text-[#a89a8c]">{when(c.at)}</span></li>)}</ul>}
      </section>
      <section>
        <h2 className="text-lg text-white font-semibold mb-3">Histórico (7 dias)</h2>
        {!past.length ? <p className="text-[#a89a8c] text-sm">Sem disputas encerradas.</p> :
          <ul className="divide-y divide-[#352b24] rounded-2xl border border-[#352b24] bg-[#1a1512]">{past.map(d => <li key={d.disputeId} className="flex justify-between gap-3 px-4 py-3 text-sm"><span className="text-[#e8dccf]">{storeName(d.merchantId)} · {ACTION_LABEL[d.action ?? ""] ?? d.action} · pedido {d.orderExternalId.slice(0, 8)}</span><span className="text-[#a89a8c]">{STATUS[d.status]}{d.settlement ? ` (${d.settlement})` : ""}</span></li>)}</ul>}
      </section>
    </div>
  );
}
