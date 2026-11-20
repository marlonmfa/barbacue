"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const TABS = [
  { href: "/admin/ifood", label: "Pedidos" },
  { href: "/admin/ifood/cardapio", label: "Cardápio" },
  { href: "/admin/ifood/entregas", label: "Logistics" },
  { href: "/admin/ifood/financeiro", label: "Financeiro" },
];

/** Abas do gestor iFood, iguais na web e no programa Windows (que abre estas mesmas páginas). */
export function IfoodTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Gestor iFood" className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
      {TABS.map(t => {
        const active = t.href === "/admin/ifood" ? path === t.href : path?.startsWith(t.href);
        return <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
          className={`whitespace-nowrap min-h-11 inline-flex items-center px-4 rounded-xl text-sm border ${active ? "bg-[var(--brand-red)] border-[var(--brand-copy)] text-white" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:text-white"}`}>{t.label}</Link>;
      })}
    </nav>
  );
}

export interface IfoodStoreRef { id: string; name: string; brand: string }

/** Lojas configuradas (Barbacue, Chelas, Hotdog) para os seletores das abas. */
export function useIfoodStores() {
  const [stores, setStores] = useState<IfoodStoreRef[]>([]);
  useEffect(() => {
    fetch("/api/admin/ifood?view=stores", { cache: "no-store" }).then(r => r.json()).then(b => setStores(b.stores ?? [])).catch(() => setStores([]));
  }, []);
  return stores;
}

export function StorePicker({ stores, value, onChange }: { stores: IfoodStoreRef[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4" role="radiogroup" aria-label="Loja iFood">
      {stores.map(s => <button key={s.id} role="radio" aria-checked={value === s.id} onClick={() => onChange(s.id)}
        className={`min-h-11 px-4 rounded-xl text-sm border ${value === s.id ? "bg-[var(--surface-2)] border-[var(--brand-copy)] text-white" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)]"}`}>{s.name}</button>)}
    </div>
  );
}

/** fetch JSON com erro legível; forbidden=true quando o módulo não está liberado no iFood. */
export function useIfoodJson<T>(url: string | null) {
  const [snapshot, setSnapshot] = useState<{ url: string; data: T } | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!url) return;
    setLoading(true); setSnapshot(null); setError(""); setForbidden(false);
    try {
      const r = await fetch(url, { cache: "no-store", signal });
      const b = await r.json().catch(() => ({}));
      if (signal?.aborted) return;
      if (!r.ok) { setSnapshot(null); setForbidden(Boolean(b.forbidden)); throw new Error(typeof b.error === "string" ? b.error : "Não foi possível consultar o iFood."); }
      setSnapshot({ url, data: b as T });
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Confira a conexão."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [url]);
  useEffect(() => {
    const controller = new AbortController();
    const t = window.setTimeout(() => void load(controller.signal), 0);
    return () => { controller.abort(); window.clearTimeout(t); };
  }, [load]);
  return { data: snapshot?.url === url ? snapshot.data : null, error, forbidden, loading, reload: load };
}

export async function sendJson(url: string, method: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: typeof b.error === "string" ? b.error : "O iFood não aceitou a mudança." };
  } catch { return { ok: false, error: "Confira a conexão e tente novamente." }; }
}

export function Notice({ error, forbidden, notice }: { error?: string; forbidden?: boolean; notice?: string }) {
  if (error) return <p role="alert" className={`mb-4 rounded-xl px-4 py-3 text-sm ${forbidden ? "bg-yellow-500/10 text-yellow-200 border border-yellow-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"}`}>{error}</p>;
  if (notice) return <p role="status" className="mb-4 rounded-xl px-4 py-3 text-sm bg-green-500/10 text-green-300 border border-green-500/30">{notice}</p>;
  return null;
}

export const fmtR = (cents: number | null | undefined) => cents == null ? "—" : `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
