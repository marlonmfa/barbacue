"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Action = "confirm" | "startPreparation" | "readyToPickup" | "dispatch" | "cancel";
interface OrderItem { name: string; priceCents: number; qty: number; notes?: string | null }
interface IfoodOrder {
  id: string; brand: "barbacue" | "barbadog" | "chelas"; customerName: string; customerPhone: string;
  orderType: "delivery" | "dine_in" | "pickup"; deliveryAddress: string | null; items: OrderItem[];
  subtotalCents: number | null; discountCents: number | null; deliveryFeeCents: number; totalCents: number;
  paymentMethod: string | null; paymentStatus: string | null; status: string; notes: string | null; createdAt: string | null;
  externalId: string | null; displayId: string | null; storeId: string | null; actions: Action[];
}
interface StoreStatus { operation?: string; available?: boolean; state?: string; message?: { title?: string; subtitle?: string; description?: string } | null }
interface Store {
  id: string; name: string; brand: string;
  status: StoreStatus[] | null; interruptions: { id: string; description?: string; start?: string; end?: string }[] | null; error: string | null;
}
interface Data { configured: boolean; dryRun: boolean; stores: Store[]; orders: IfoodOrder[] }

const ACTION_LABEL: Record<Action, string> = { confirm: "Confirmar", startPreparation: "Iniciar preparo", readyToPickup: "Pronto p/ retirada", dispatch: "Saiu p/ entrega", cancel: "Cancelar" };
const COLUMNS = [
  { key: "new", title: "Novos", statuses: ["pending"] },
  { key: "prep", title: "Em preparo", statuses: ["confirmed", "preparing"] },
  { key: "ready", title: "Prontos / em entrega", statuses: ["ready"] },
  { key: "done", title: "Concluídos (24h)", statuses: ["delivered", "cancelled"] },
];
const STATUS_LABEL: Record<string, string> = { pending: "Aguardando confirmação", confirmed: "Confirmado", preparing: "Preparando", ready: "Pronto / despachado", delivered: "Concluído", cancelled: "Cancelado" };
const STATE_STYLE: Record<string, string> = { OK: "bg-green-500/20 text-green-300", WARNING: "bg-yellow-500/20 text-yellow-300", CLOSED: "bg-[#352b24] text-[#c8b89a]", ERROR: "bg-red-500/20 text-red-300" };
const STATE_LABEL: Record<string, string> = { OK: "Aberta", WARNING: "Aberta com alerta", CLOSED: "Fechada", ERROR: "Com problema" };
const TYPE_LABEL = { delivery: "Entrega", pickup: "Retirada", dine_in: "No local" } as const;

const fmtR = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—";
const minutesAgo = (iso: string | null, now: number) => iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0;

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach(offset => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = 880; osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.3);
      osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.3);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch { /* sem áudio disponível */ }
}

export default function IfoodManager() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState("");
  const [sound, setSound] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [pauseMinutes, setPauseMinutes] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<IfoodOrder | null>(null);
  const [cancelling, setCancelling] = useState<{ order: IfoodOrder; reasons: { cancelCodeId: string; description: string }[] | null } | null>(null);
  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/ifood", { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível carregar o gestor iFood.");
      const next = body as Data;
      const pending = next.orders.filter(o => o.status === "pending").map(o => o.id);
      if (known.current && pending.some(id => !known.current!.has(id)) && soundRef.current) beep();
      known.current = new Set(next.orders.map(o => o.id));
      setData(next); setError(""); setNow(Date.now());
      setSelected(current => current ? next.orders.find(o => o.id === current.id) ?? null : null);
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente."); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void load(controller.signal), 0);
    const timer = window.setInterval(() => void load(controller.signal), 10_000);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  const pendingCount = data?.orders.filter(o => o.status === "pending").length ?? 0;
  useEffect(() => { document.title = pendingCount ? `(${pendingCount}) Gestor iFood` : "Gestor iFood"; }, [pendingCount]);

  async function send(url: string, init: RequestInit, key: string, success: string) {
    if (busy) return;
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "O iFood não aceitou a ação.");
      setNotice(success);
      await load();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente."); return false; }
    finally { setBusy(null); }
  }

  async function act(order: IfoodOrder, action: Action) {
    if (action === "cancel") {
      setCancelling({ order, reasons: null });
      const response = await fetch(`/api/admin/ifood/orders/${order.id}?reasons=1`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setCancelling(null); setError(typeof body.error === "string" ? body.error : "Não foi possível consultar os motivos de cancelamento."); return; }
      setCancelling({ order, reasons: body.reasons ?? [] });
      return;
    }
    await send(`/api/admin/ifood/orders/${order.id}`, { method: "POST", body: JSON.stringify({ action }) }, order.id,
      `${ACTION_LABEL[action]} enviado ao iFood. A etapa muda aqui quando o iFood confirmar.`);
  }

  async function confirmCancel(code: string, reason: string) {
    if (!cancelling) return;
    const ok = await send(`/api/admin/ifood/orders/${cancelling.order.id}`, { method: "POST", body: JSON.stringify({ action: "cancel", cancellationCode: code, reason }) },
      cancelling.order.id, "Cancelamento solicitado ao iFood.");
    if (ok) setCancelling(null);
  }

  // Sem window.prompt: o Electron não oferece diálogos nativos para páginas remotas.
  async function pause(store: Store) {
    const minutes = pauseMinutes[store.id] ?? 30;
    await send(`/api/admin/ifood/stores/${store.id}`, { method: "POST", body: JSON.stringify({ minutes, description: "Pausa pelo gestor Barbacue" }) }, store.id, `${store.name} pausada por ${minutes} min.`);
  }

  async function resume(store: Store, interruptionId: string) {
    await send(`/api/admin/ifood/stores/${store.id}?interruption=${encodeURIComponent(interruptionId)}`, { method: "DELETE" }, store.id, `${store.name} reaberta no iFood.`);
  }

  const storeName = (id: string | null) => data?.stores.find(s => s.id === id)?.name ?? "Loja";
  const visible = (data?.orders ?? []).filter(o => !storeFilter || o.storeId === storeFilter);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestor iFood</h1>
          <p className="text-[#a89a8c] text-sm mt-2">Pedidos das três lojas em um só lugar. As ações vão direto para o iFood.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSound(v => !v)} className="min-h-12 text-sm px-4 py-2 rounded-xl bg-[#1a1512] border border-[#352b24] text-[#c8b89a]">{sound ? "🔔 Som ligado" : "🔕 Som desligado"}</button>
          <button onClick={() => void load()} className="min-h-12 text-[#a89a8c] hover:text-white text-sm px-4 py-2 rounded-xl bg-[#1a1512] border border-[#352b24]">↻ Atualizar</button>
        </div>
      </div>

      {data && !data.configured && <p role="alert" className="mb-4 border border-yellow-900/60 bg-yellow-950/40 text-yellow-200 p-4 rounded-xl text-sm">As credenciais do iFood não estão configuradas no servidor. Os pedidos importados aparecem, mas as ações ficam indisponíveis.</p>}
      {data?.configured && data.dryRun && <p role="alert" className="mb-4 border border-yellow-900/60 bg-yellow-950/40 text-yellow-200 p-4 rounded-xl text-sm">Modo simulação (IFOOD_DRY_RUN): nenhuma ação é enviada ao iFood.</p>}
      {error && <p role="alert" className="mb-4 border border-red-900/60 bg-red-950/40 text-red-200 p-4 rounded-xl text-sm">{error}</p>}
      {notice && <p role="status" className="mb-4 border border-green-900/60 bg-green-950/40 text-green-200 p-4 rounded-xl text-sm">{notice}</p>}

      <div className="grid gap-3 md:grid-cols-3 mb-6">
        {(data?.stores ?? []).map(store => {
          const main = store.status?.find(s => s.operation === "DELIVERY") ?? store.status?.[0];
          const state = main?.state ?? (store.error ? "ERROR" : "");
          const pausedBy = store.interruptions?.find(i => (!i.start || Date.parse(i.start) <= now) && (!i.end || Date.parse(i.end) > now));
          const count = data?.orders.filter(o => o.storeId === store.id && ["pending", "confirmed", "preparing", "ready"].includes(o.status)).length ?? 0;
          return (
            <section key={store.id} className={`rounded-2xl border p-4 bg-[#1a1512] ${storeFilter === store.id ? "border-[#ed1b24]" : "border-[#352b24]"}`}>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setStoreFilter(f => f === store.id ? "" : store.id)} className="text-left">
                  <h2 className="text-white font-semibold">{store.name}</h2>
                  <p className="text-xs text-[#a89a8c]">{count} pedido(s) em andamento</p>
                </button>
                {state && <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATE_STYLE[state] ?? STATE_STYLE.CLOSED}`}>{STATE_LABEL[state] ?? state}</span>}
              </div>
              {(main?.message?.title || store.error) && <p className="text-xs text-[#c8b89a] mt-2">{store.error ?? [main?.message?.title, main?.message?.subtitle].filter(Boolean).join(" · ")}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {pausedBy
                  ? <button disabled={busy !== null} onClick={() => void resume(store, pausedBy.id)} className="min-h-10 text-xs px-3 rounded-lg bg-green-600/80 hover:bg-green-600 text-white">Reabrir (pausada até {time(pausedBy.end ?? null)})</button>
                  : <>
                      <select aria-label={`Tempo de pausa de ${store.name}`} value={pauseMinutes[store.id] ?? 30} onChange={e => setPauseMinutes(m => ({ ...m, [store.id]: Number(e.target.value) }))}
                        className="min-h-10 rounded-lg bg-[#241d18] px-2 text-xs text-white">
                        {[15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
                      </select>
                      <button disabled={busy !== null || !data?.configured} onClick={() => void pause(store)} className="min-h-10 text-xs px-3 rounded-lg bg-[#241d18] hover:bg-[#352b24] text-[#c8b89a] disabled:opacity-50">Pausar loja</button>
                    </>}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setStoreFilter("")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${!storeFilter ? "bg-[#ed1b24] text-white" : "bg-[#1a1512] text-[#a89a8c] border border-[#352b24]"}`}>Todas as lojas</button>
        {(data?.stores ?? []).map(s => (
          <button key={s.id} onClick={() => setStoreFilter(s.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${storeFilter === s.id ? "bg-[#ed1b24] text-white" : "bg-[#1a1512] text-[#a89a8c] border border-[#352b24]"}`}>{s.name}</button>
        ))}
      </div>

      {!data && !error ? <p className="text-[#a89a8c] text-sm">Carregando...</p> : (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map(column => {
            const list = visible.filter(o => column.statuses.includes(o.status));
            return (
              <section key={column.key} className="bg-[#120e0c] rounded-2xl border border-[#352b24] p-3 min-h-40">
                <h2 className="text-sm font-semibold text-[#c8b89a] mb-3">{column.title} ({list.length})</h2>
                <div className="space-y-3">
                  {list.map(order => {
                    const waiting = minutesAgo(order.createdAt, now);
                    const late = order.status === "pending" && waiting >= 5;
                    return (
                      <article key={order.id} className={`rounded-xl border p-3 bg-[#1a1512] ${order.status === "pending" ? (late ? "border-red-500 animate-pulse" : "border-yellow-500/70") : "border-[#352b24]"}`}>
                        <button onClick={() => setSelected(order)} className="w-full text-left">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-[#ed1b24]">{storeName(order.storeId)}</span>
                            <span className="text-xs text-[#a89a8c]">{time(order.createdAt)} · {waiting} min</span>
                          </div>
                          <p className="text-white font-semibold mt-1">#{order.displayId ?? order.id.slice(0, 6).toUpperCase()} · {order.customerName}</p>
                          <p className="text-xs text-[#a89a8c]">{TYPE_LABEL[order.orderType]} · {fmtR(order.totalCents)} · {order.paymentStatus === "paid" ? "Pago online" : "Cobrar na entrega"}</p>
                          <ul className="text-xs text-[#c8b89a] mt-2 space-y-0.5">
                            {(Array.isArray(order.items) ? order.items : []).slice(0, 4).map((item, i) => <li key={i}>{item.qty}× {item.name}</li>)}
                            {order.items.length > 4 && <li>+ {order.items.length - 4} item(ns)</li>}
                          </ul>
                        </button>
                        {order.status === "cancelled" && <p className="text-xs text-red-300 mt-2">Cancelado</p>}
                        {order.actions.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {order.actions.map(action => (
                              <button key={action} disabled={busy !== null || !data?.configured} onClick={() => void act(order, action)}
                                className={`min-h-10 text-xs px-3 rounded-lg disabled:opacity-50 ${action === "cancel" ? "bg-[#241d18] text-red-300 hover:bg-red-950/60" : "bg-[#ed1b24] hover:bg-[#c8141c] text-white font-semibold"}`}>
                                {busy === order.id ? "Enviando…" : ACTION_LABEL[action]}
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {list.length === 0 && <p className="text-xs text-[#6b5d52] text-center py-6">Nenhum pedido</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Detalhes do pedido iFood">
          <div className="bg-[#1a1512] rounded-2xl border border-[#352b24] w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">iFood #{selected.displayId ?? selected.id.slice(0, 6).toUpperCase()}</h2>
                <p className="text-xs text-[#a89a8c]">{storeName(selected.storeId)} · {TYPE_LABEL[selected.orderType]} · {STATUS_LABEL[selected.status] ?? selected.status}</p>
              </div>
              <button onClick={() => setSelected(null)} className="min-w-12 min-h-12 text-[#a89a8c] hover:text-white text-2xl leading-none" aria-label="Fechar">×</button>
            </div>
            <p className="text-white">{selected.customerName}{selected.customerPhone ? ` · ${selected.customerPhone}` : ""}</p>
            {selected.deliveryAddress && <p className="text-sm text-[#c8b89a] mt-1">{selected.deliveryAddress}</p>}
            <ul className="mt-4 space-y-2 text-sm">
              {selected.items.map((item, i) => (
                <li key={i} className="flex justify-between gap-3 text-[#e8dccb]">
                  <span>{item.qty}× {item.name}{item.notes && <span className="block text-xs text-[#a89a8c]">{item.notes}</span>}</span>
                  <span>{fmtR(item.qty * item.priceCents)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-[#352b24] mt-4 pt-3 text-sm text-[#c8b89a] space-y-1">
              {selected.deliveryFeeCents > 0 && <p className="flex justify-between"><span>Entrega</span><span>{fmtR(selected.deliveryFeeCents)}</span></p>}
              {(selected.discountCents ?? 0) > 0 && <p className="flex justify-between"><span>Descontos</span><span>- {fmtR(selected.discountCents ?? 0)}</span></p>}
              <p className="flex justify-between text-white font-semibold"><span>Total</span><span>{fmtR(selected.totalCents)}</span></p>
            </div>
            {selected.notes && <pre className="mt-4 whitespace-pre-wrap text-xs text-[#a89a8c] bg-[#120e0c] rounded-lg p-3">{selected.notes}</pre>}
            {selected.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {selected.actions.map(action => (
                  <button key={action} disabled={busy !== null || !data?.configured} onClick={() => void act(selected, action)}
                    className={`min-h-12 text-sm px-4 rounded-xl disabled:opacity-50 ${action === "cancel" ? "bg-[#241d18] text-red-300" : "bg-[#ed1b24] text-white font-semibold"}`}>{ACTION_LABEL[action]}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {cancelling && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Cancelar pedido iFood">
          <div className="bg-[#1a1512] rounded-2xl border border-[#352b24] w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white">Cancelar #{cancelling.order.displayId ?? cancelling.order.id.slice(0, 6).toUpperCase()}</h2>
            <p className="text-sm text-[#a89a8c] mt-1 mb-4">Escolha o motivo aceito pelo iFood. O cliente é avisado pelo iFood.</p>
            {!cancelling.reasons ? <p className="text-sm text-[#a89a8c]">Consultando motivos…</p>
              : cancelling.reasons.length === 0 ? <p className="text-sm text-[#c8b89a]">O iFood não oferece cancelamento para este pedido agora.</p>
              : <div className="space-y-2">{cancelling.reasons.map(r => (
                <button key={r.cancelCodeId} disabled={busy !== null} onClick={() => void confirmCancel(r.cancelCodeId, r.description)}
                  className="w-full text-left min-h-12 px-4 rounded-xl bg-[#241d18] hover:bg-red-950/60 text-[#e8dccb] text-sm">{r.description}</button>
              ))}</div>}
            <button onClick={() => setCancelling(null)} className="mt-4 min-h-12 w-full rounded-xl border border-[#352b24] text-[#a89a8c]">Voltar</button>
          </div>
        </div>
      )}
    </div>
  );
}
