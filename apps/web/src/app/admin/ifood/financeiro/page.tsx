"use client";

import { useState } from "react";
import { IfoodTabs, Notice, StorePicker, fmtR, useIfoodJson, useIfoodStores } from "@/components/admin/ifood/IfoodTabs";

type Part = { data: unknown; error: string | null };
interface Data { from: string; to: string; sales: Part; settlements: Part }
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

/** O formato varia entre versões da API; mostra linhas e soma os campos de valor conhecidos. */
function rows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const o = (data ?? {}) as Record<string, unknown>;
  for (const k of ["sales", "settlements", "data", "items", "content"]) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  return [];
}
const amount = (r: Record<string, unknown>) => {
  for (const k of ["amount", "netValue", "grossValue", "totalAmount", "value", "orderAmount"]) {
    const v = r[k]; const n = typeof v === "number" ? v : typeof v === "object" && v && typeof (v as Record<string, unknown>).value === "number" ? (v as { value: number }).value : null;
    if (n != null) return Math.round(n * 100);
  }
  return null;
};

function Table({ title, part }: { title: string; part: Part | undefined }) {
  if (!part) return null;
  const list = rows(part.data);
  const total = list.reduce((s, r) => s + (amount(r) ?? 0), 0);
  return (
    <section className="mb-6">
      <h2 className="text-white font-semibold mb-2">{title} {list.length ? <span className="text-[#a89a8c] text-sm font-normal">· {list.length} registros · {fmtR(total)}</span> : null}</h2>
      {part.error ? <Notice error={part.error} forbidden={part.error.startsWith("Sem permissão")} /> : !list.length ? <p className="text-[#a89a8c] text-sm">Nada no período.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-[#352b24] bg-[#1a1512]">
          <table className="w-full text-sm"><tbody>{list.slice(0, 200).map((r, i) => (
            <tr key={i} className="border-b border-[#352b24] last:border-0">
              <td className="px-3 py-2 text-[#e8dccf]">{String(r.orderShortId ?? r.shortId ?? r.orderId ?? r.id ?? r.type ?? "—").slice(0, 24)}</td>
              <td className="px-3 py-2 text-[#a89a8c]">{String(r.salesDate ?? r.paymentDate ?? r.date ?? r.createdAt ?? "").slice(0, 10)}</td>
              <td className="px-3 py-2 text-[#a89a8c]">{String(r.status ?? r.paymentStatus ?? r.type ?? "")}</td>
              <td className="px-3 py-2 text-right text-white">{fmtR(amount(r))}</td>
            </tr>))}</tbody></table>
        </div>
      )}
    </section>
  );
}

export default function IfoodFinancial() {
  const stores = useIfoodStores();
  const [storeId, setStoreId] = useState(""); const [from, setFrom] = useState(day(7)); const [to, setTo] = useState(day(0));
  const current = storeId || stores[0]?.id || "";
  const { data, error, forbidden, loading } = useIfoodJson<Data>(current ? `/api/admin/ifood/stores/${current}/financial?from=${from}&to=${to}` : null);
  return (
    <div>
      <IfoodTabs />
      <h1 className="text-2xl font-bold text-white mb-1">Financeiro do iFood</h1>
      <p className="text-[#a89a8c] text-sm mb-4">Vendas e repasses informados pelo iFood (até 31 dias por consulta).</p>
      <StorePicker stores={stores} value={current} onChange={setStoreId} />
      <div className="flex flex-wrap gap-2 mb-4 items-center text-sm text-[#a89a8c]">
        De <input aria-label="De" type="date" value={from} onChange={e => setFrom(e.target.value)} className="min-h-11 rounded-xl bg-[#0e0b0a] border border-[#352b24] px-2 text-white" />
        até <input aria-label="Até" type="date" value={to} onChange={e => setTo(e.target.value)} className="min-h-11 rounded-xl bg-[#0e0b0a] border border-[#352b24] px-2 text-white" />
      </div>
      <Notice error={error} forbidden={forbidden} />
      {loading && <p className="text-[#a89a8c] text-sm">Carregando…</p>}
      <Table title="Vendas" part={data?.sales} />
      <Table title="Repasses" part={data?.settlements} />
    </div>
  );
}
