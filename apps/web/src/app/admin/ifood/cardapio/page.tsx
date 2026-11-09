"use client";

import { useState } from "react";
import { IfoodTabs, Notice, StorePicker, fmtR, sendJson, useIfoodJson, useIfoodStores } from "@/components/admin/ifood/IfoodTabs";
import type { CatalogCategory } from "@/lib/ifood-shapes";

interface Data { catalogId: string | null; categories: CatalogCategory[] }

export default function IfoodCatalog() {
  const stores = useIfoodStores();
  const [storeId, setStoreId] = useState("");
  const current = storeId || stores[0]?.id || "";
  const { data, error, forbidden, loading, reload } = useIfoodJson<Data>(current ? `/api/admin/ifood/stores/${current}/catalog` : null);
  const [filter, setFilter] = useState(""); const [busy, setBusy] = useState(""); const [notice, setNotice] = useState(""); const [fail, setFail] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});

  async function patch(itemId: string, body: Record<string, unknown>, label: string) {
    setBusy(itemId); setFail(""); setNotice("");
    const r = await sendJson(`/api/admin/ifood/stores/${current}/catalog`, "PATCH", { itemId, ...body });
    setBusy("");
    if (r.ok) { setNotice(label); await reload(); } else setFail(r.error ?? "");
  }

  const q = filter.trim().toLowerCase();
  return (
    <div>
      <IfoodTabs />
      <h1 className="text-2xl font-bold text-white mb-1">Cardápio no iFood</h1>
      <p className="text-[#a89a8c] text-sm mb-4">Pause itens em falta e ajuste preços direto no iFood de cada loja.</p>
      <StorePicker stores={stores} value={current} onChange={setStoreId} />
      <Notice error={error || fail} forbidden={forbidden} notice={notice} />
      <input aria-label="Buscar item" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar item" className="w-full md:w-80 min-h-11 mb-4 rounded-xl bg-[#0e0b0a] border border-[#352b24] px-3 text-sm text-white" />
      {loading && <p className="text-[#a89a8c] text-sm">Carregando…</p>}
      {data && !data.categories.length && <p className="text-[#a89a8c] text-sm">Nenhum item no catálogo desta loja.</p>}
      {data?.categories.map(c => {
        const items = c.items.filter(i => !q || i.name.toLowerCase().includes(q));
        if (!items.length) return null;
        return (
          <section key={c.id} className="mb-6">
            <h2 className="text-white font-semibold mb-2">{c.name}</h2>
            <ul className="divide-y divide-[#352b24] rounded-2xl border border-[#352b24] bg-[#1a1512]">
              {items.map(i => {
                const available = i.status === "AVAILABLE";
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className={`flex-1 min-w-40 text-sm ${available ? "text-[#e8dccf]" : "text-[#7a6d62] line-through"}`}>{i.name}</span>
                    <span className="text-sm text-[#c8b89a]">{fmtR(i.priceCents)}{i.originalPriceCents ? <s className="ml-1 text-[#7a6d62]">{fmtR(i.originalPriceCents)}</s> : null}</span>
                    <input aria-label={`Novo preço de ${i.name}`} inputMode="decimal" value={prices[i.id] ?? ""} onChange={e => setPrices(p => ({ ...p, [i.id]: e.target.value }))} placeholder="Novo preço" className="w-28 min-h-11 rounded-xl bg-[#0e0b0a] border border-[#352b24] px-3 text-sm text-white" />
                    <button disabled={busy === i.id || !prices[i.id]} onClick={() => {
                      const cents = Math.round(Number((prices[i.id] ?? "").replace(",", ".")) * 100);
                      if (!Number.isSafeInteger(cents) || cents <= 0) { setFail("Preço inválido."); return; }
                      void patch(i.id, { priceCents: cents }, `Preço de ${i.name} enviado ao iFood.`);
                    }} className="min-h-11 px-3 rounded-xl bg-[#2a201b] border border-[#352b24] text-sm text-[#e8dccf] disabled:opacity-50">Salvar preço</button>
                    <button disabled={busy === i.id} onClick={() => void patch(i.id, { available: !available }, `${i.name} ${available ? "pausado" : "disponível"} no iFood.`)}
                      className={`min-h-11 px-3 rounded-xl text-sm ${available ? "bg-[#ed1b24] text-white" : "bg-green-600 text-white"} disabled:opacity-50`}>{available ? "Pausar" : "Ativar"}</button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
