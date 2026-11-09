"use client";

import { useEffect, useState } from "react";
import { IfoodTabs, Notice, StorePicker, sendJson, useIfoodJson, useIfoodStores } from "@/components/admin/ifood/IfoodTabs";
import { DAYS, type Day, type Shift } from "@/lib/ifood-shapes";

const DAY_LABEL: Record<Day, string> = { MONDAY: "Segunda", TUESDAY: "Terça", WEDNESDAY: "Quarta", THURSDAY: "Quinta", FRIDAY: "Sexta", SATURDAY: "Sábado", SUNDAY: "Domingo" };
const toEnd = (start: string, duration: number) => { const [h, m] = start.split(":").map(Number); const t = (h * 60 + m + duration) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const toDuration = (start: string, end: string) => { const [a, b] = start.split(":").map(Number); const [c, d] = end.split(":").map(Number); const x = (c * 60 + d) - (a * 60 + b); return x <= 0 ? x + 1440 : x; };

export default function IfoodHours() {
  const stores = useIfoodStores();
  const [storeId, setStoreId] = useState("");
  const current = storeId || stores[0]?.id || "";
  const { data, error, forbidden, reload } = useIfoodJson<{ shifts: Shift[] }>(current ? `/api/admin/ifood/stores/${current}/hours` : null);
  const [rows, setRows] = useState<{ dayOfWeek: Day; start: string; end: string }[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [fail, setFail] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setRows((data?.shifts ?? []).map(s => ({ dayOfWeek: s.dayOfWeek, start: s.start, end: toEnd(s.start, s.duration) }))), 0);
    return () => window.clearTimeout(t);
  }, [data]);

  async function save() {
    setBusy(true); setFail(""); setNotice("");
    const r = await sendJson(`/api/admin/ifood/stores/${current}/hours`, "PUT", { shifts: rows.map(x => ({ dayOfWeek: x.dayOfWeek, start: x.start, duration: toDuration(x.start, x.end) })) });
    setBusy(false);
    if (r.ok) { setNotice("Horários enviados ao iFood."); await reload(); } else setFail(r.error ?? "");
  }

  return (
    <div>
      <IfoodTabs />
      <h1 className="text-2xl font-bold text-white mb-1">Horários no iFood</h1>
      <p className="text-[#a89a8c] text-sm mb-4">Turnos de funcionamento de cada loja no iFood. Turnos que passam da meia-noite são aceitos.</p>
      <StorePicker stores={stores} value={current} onChange={setStoreId} />
      <Notice error={error || fail} forbidden={forbidden} notice={notice} />
      {!forbidden && !error && (
        <div className="rounded-2xl border border-[#352b24] bg-[#1a1512] p-4">
          {DAYS.map(day => (
            <div key={day} className="flex flex-wrap items-center gap-2 py-2 border-b border-[#352b24] last:border-0">
              <strong className="w-24 text-sm text-white">{DAY_LABEL[day]}</strong>
              {rows.map((r, i) => r.dayOfWeek !== day ? null : (
                <span key={i} className="flex items-center gap-1">
                  <input aria-label={`Início ${DAY_LABEL[day]}`} type="time" value={r.start} onChange={e => setRows(x => x.map((y, k) => k === i ? { ...y, start: e.target.value } : y))} className="min-h-11 rounded-xl bg-[#0e0b0a] border border-[#352b24] px-2 text-sm text-white" />
                  <span className="text-[#a89a8c]">às</span>
                  <input aria-label={`Fim ${DAY_LABEL[day]}`} type="time" value={r.end} onChange={e => setRows(x => x.map((y, k) => k === i ? { ...y, end: e.target.value } : y))} className="min-h-11 rounded-xl bg-[#0e0b0a] border border-[#352b24] px-2 text-sm text-white" />
                  <button aria-label="Remover turno" onClick={() => setRows(x => x.filter((_, k) => k !== i))} className="min-h-11 px-3 text-[#ed1b24]">×</button>
                </span>
              ))}
              {!rows.some(r => r.dayOfWeek === day) && <span className="text-sm text-[#7a6d62]">Fechado</span>}
              <button onClick={() => setRows(x => [...x, { dayOfWeek: day, start: "18:00", end: "23:00" }])} className="min-h-11 px-3 rounded-xl bg-[#2a201b] border border-[#352b24] text-sm text-[#c8b89a]">+ turno</button>
            </div>
          ))}
          <button disabled={busy} onClick={() => void save()} className="mt-4 min-h-12 px-6 rounded-xl bg-[#ed1b24] text-white font-semibold disabled:opacity-50">Salvar no iFood</button>
        </div>
      )}
    </div>
  );
}
