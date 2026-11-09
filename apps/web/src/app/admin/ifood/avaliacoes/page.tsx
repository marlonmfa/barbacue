"use client";

import { useState } from "react";
import { IfoodTabs, Notice, StorePicker, sendJson, useIfoodJson, useIfoodStores, when } from "@/components/admin/ifood/IfoodTabs";

type Rec = Record<string, unknown>;
interface Data { list: Rec; summary: Rec | null }
const num = (v: unknown) => (typeof v === "number" ? v : null);
const txt = (v: unknown) => (typeof v === "string" ? v : "");

export default function IfoodReviews() {
  const stores = useIfoodStores();
  const [storeId, setStoreId] = useState("");
  const [page, setPage] = useState(1);
  const current = storeId || stores[0]?.id || "";
  const { data, error, forbidden, reload } = useIfoodJson<Data>(current ? `/api/admin/ifood/stores/${current}/reviews?page=${page}` : null);
  const [draft, setDraft] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(""); const [notice, setNotice] = useState(""); const [fail, setFail] = useState("");
  const list = (Array.isArray(data?.list?.reviews) ? data!.list.reviews : []) as Rec[];
  const score = num(data?.summary?.score) ?? num(data?.summary?.averageScore);
  const total = num(data?.summary?.totalReviewsCount) ?? num(data?.list?.total);

  async function reply(id: string) {
    setBusy(id); setFail(""); setNotice("");
    const r = await sendJson(`/api/admin/ifood/stores/${current}/reviews`, "POST", { reviewId: id, text: draft[id] ?? "" });
    setBusy("");
    if (r.ok) { setNotice("Resposta publicada no iFood."); setDraft(d => ({ ...d, [id]: "" })); await reload(); } else setFail(r.error ?? "");
  }

  return (
    <div>
      <IfoodTabs />
      <h1 className="text-2xl font-bold text-white mb-1">Avaliações do iFood</h1>
      <StorePicker stores={stores} value={current} onChange={id => { setStoreId(id); setPage(1); }} />
      <Notice error={error || fail} forbidden={forbidden} notice={notice} />
      {score != null && <p className="text-white mb-4">Nota média <strong className="text-2xl">{score.toFixed(1)}</strong>{total != null ? <span className="text-[#a89a8c] text-sm"> · {total} avaliações</span> : null}</p>}
      {data && !list.length && <p className="text-[#a89a8c] text-sm">Nenhuma avaliação nesta página.</p>}
      <div className="grid gap-3">
        {list.map(r => {
          const id = txt(r.id); const replies = (Array.isArray(r.replies) ? r.replies : Array.isArray(r.answers) ? r.answers : []) as Rec[];
          return (
            <article key={id} className="rounded-2xl border border-[#352b24] bg-[#1a1512] p-4">
              <header className="flex justify-between text-sm mb-2"><strong className="text-white">{"★".repeat(Math.round(num(r.score) ?? 0))}<span className="text-[#7a6d62]">{"★".repeat(5 - Math.round(num(r.score) ?? 0))}</span></strong><span className="text-[#a89a8c]">{when(txt(r.createdAt))}</span></header>
              {txt(r.comment) && <p className="text-[#e8dccf] text-sm mb-2">{txt(r.comment)}</p>}
              {replies.map((a, k) => <p key={k} className="text-sm text-[#c8b89a] border-l-2 border-[#ed1b24] pl-3 mb-2">Loja: {txt(a.text)}</p>)}
              {!replies.length && id && (
                <div className="flex gap-2">
                  <input aria-label="Resposta" value={draft[id] ?? ""} onChange={e => setDraft(d => ({ ...d, [id]: e.target.value }))} maxLength={300} placeholder="Responder (10 a 300 caracteres)" className="flex-1 min-h-11 rounded-xl bg-[#0e0b0a] border border-[#352b24] px-3 text-sm text-white" />
                  <button disabled={busy === id || (draft[id] ?? "").trim().length < 10} onClick={() => void reply(id)} className="min-h-11 px-4 rounded-xl bg-[#ed1b24] text-white text-sm disabled:opacity-50">Responder</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {data && <div className="flex gap-2 mt-4"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="min-h-11 px-4 rounded-xl bg-[#1a1512] border border-[#352b24] text-sm text-[#c8b89a] disabled:opacity-40">Anteriores</button><button disabled={list.length < 20} onClick={() => setPage(p => p + 1)} className="min-h-11 px-4 rounded-xl bg-[#1a1512] border border-[#352b24] text-sm text-[#c8b89a] disabled:opacity-40">Mais antigas</button></div>}
    </div>
  );
}
