"use client";

import { useCallback, useEffect, useState } from "react";
import { OrderImport } from "@/components/admin/OrderImport";
import { AdminIcon } from "@/components/admin/AdminIcons";

interface OrderItem { name: string; priceCents: number; qty: number; notes?: string | null; }
interface Order {
  id: string; customerName: string; customerPhone: string;
  brand: "barbacue" | "barbadog" | "chelas";
  deliveryAddress: string | null; items: OrderItem[];
  deliveryFeeCents: number;
  deliveryDistanceMeters: number | null;
  deliveryDurationSeconds: number | null;
  deliveryDriverId: number | null;
  deliveryDriverName: string | null;
  deliveryStatus: "assigned" | "out_for_delivery" | "delivered" | null;
  navigationLinks: { google: string; apple: string; osm: string | null } | null;
  subtotalCents: number | null; discountCents: number | null;
  totalCents: number; couponCode: string | null;
  channel: string | null;
  orderType: "delivery" | "dine_in" | "pickup";
  tableNumber: number | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  status: string; notes: string | null; createdAt: string | null;
}

const STATUSES = [
  { key: "pending",   label: "Pendente",   color: "bg-yellow-500/20 text-yellow-300" },
  { key: "confirmed", label: "Confirmado", color: "bg-blue-500/20 text-blue-300" },
  { key: "preparing", label: "Preparando", color: "bg-orange-500/20 text-orange-300" },
  { key: "ready",     label: "Pronto",     color: "bg-green-500/20 text-green-300" },
  { key: "delivered", label: "Entregue",   color: "bg-[#352b24] text-[#a89a8c]" },
  { key: "cancelled", label: "Cancelado",  color: "bg-red-500/20 text-red-400" },
];

const CHANNELS: Record<string, string> = { click: "Site / aplicativo", chat: "WhatsApp / chat", kiosk: "Totem", table_qr: "QR da mesa", ifood: "iFood", test: "Teste", other: "Outra origem" };
const channelLabel = (channel: string | null) => CHANNELS[channel ?? "other"] ?? channel ?? "Outra origem";

const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
const BRAND_LABEL = { barbacue: "Barbacue", barbadog: "Barbadog", chelas: "Chelas" } as const;
const destination = (order: Order) => order.tableNumber ? `Mesa ${order.tableNumber}` : order.orderType === "pickup" ? "Retirada no balcão" : order.orderType === "dine_in" ? "No local" : "Entrega";

function fmtR(cents: number) {
  return `R$${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [drivers, setDrivers] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [response, driverResponse] = await Promise.all([fetch("/api/admin/orders", { cache: "no-store", signal }), fetch("/api/admin/orders?drivers=1", { cache: "no-store", signal })]);
      const [data, driverData] = await Promise.all([response.json(), driverResponse.json()]);
      if (!response.ok || !driverResponse.ok) throw new Error("Não foi possível carregar os pedidos. Confira seu acesso e tente novamente.");
      setOrders(data); setDrivers(driverData.drivers); setError("");
      setSelected(current => current ? data.find((order: Order) => order.id === current.id) ?? null : null);
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void load(controller.signal), 0);
    const timer = window.setInterval(() => void load(controller.signal), 15_000);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  async function updateOrder(orderId: string, patch: { status?: string; deliveryDriverId?: number | null }) {
    if (busy) return;
    setBusy(orderId); setError("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível atualizar o pedido.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente."); }
    finally { setBusy(null); }
  }

  const filtered = orders.filter(o => (!filterStatus || o.status === filterStatus) && (!filterChannel || (o.channel || "other") === filterChannel));
  const channels = [...new Set(orders.map(o => o.channel || "other"))].sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-white">Caixa e pedidos</h1><p className="text-[#a89a8c] text-sm mt-2">Confirme os pedidos e organize quem leva cada entrega.</p></div>
        <button onClick={() => void load()} className="min-h-12 text-[#a89a8c] hover:text-white text-sm px-4 py-2 rounded-xl bg-[#1a1512] border border-[#352b24]">
          ↻ Atualizar
        </button>
      </div>
      {error && <p role="alert" className="mb-5 border border-red-900/60 bg-red-950/40 text-red-200 p-4 rounded-xl text-sm">{error}</p>}

      <OrderImport onImported={() => void load()} />
      <label className="block mb-5 text-sm text-[#c8b89a]">Origem do pedido
        <select className="ml-3 min-h-12 rounded-lg bg-[#241d18] px-3 text-white" value={filterChannel} onChange={e => setFilterChannel(e.target.value)}><option value="">Todas as origens</option>{channels.map(channel => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}</select>
      </label>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setFilterStatus("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!filterStatus ? "bg-[#ed1b24] hover:bg-[#c8141c] text-white" : "bg-[#1a1512] text-[#a89a8c] border border-[#352b24]"}`}>
          Todos ({orders.length})
        </button>
        {STATUSES.map((s) => {
          const n = orders.filter((o) => o.status === s.key).length;
          return (
            <button key={s.key} onClick={() => setFilterStatus(s.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === s.key ? "bg-[#ed1b24] hover:bg-[#c8141c] text-white" : "bg-[#1a1512] text-[#a89a8c] border border-[#352b24]"}`}>
              {s.label} ({n})
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-[#a89a8c] text-sm">Carregando...</p>
      ) : (
        <div className="bg-[#1a1512] rounded-2xl border border-[#352b24] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#0e0b0a] text-[#a89a8c] text-left">
              <tr>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Itens</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Horário</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const st = STATUS_MAP[o.status] ?? STATUSES[0];
                const items = Array.isArray(o.items) ? o.items : [];
                return (
                  <tr key={o.id} className="border-t border-[#352b24] hover:bg-[#241d18]">
                    <td className="px-5 py-3">
                      <p className="flex items-center gap-2 text-white font-medium">
                        {o.customerName}
                        <span className="text-xs font-normal text-[#c8b89a]">{channelLabel(o.channel)}</span>
                        {o.channel === "test" && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-emerald-300">TESTE</span>
                        )}
                      </p>
                      <p className="text-[#a89a8c] text-xs">{BRAND_LABEL[o.brand] ?? "Barbacue"} · {destination(o)}{o.customerPhone ? ` · ${o.customerPhone}` : ""}</p>
                      {(o.channel === "kiosk" || o.channel === "table_qr") && <p className="text-[#c8b89a] text-xs mt-1">{o.channel === "kiosk" ? "Totem" : "QR na mesa"} · {o.paymentStatus === "paid" ? "Pago" : "Pagamento no local pendente"}</p>}
                      {o.orderType === "delivery" && <p className="text-[#c8b89a] text-xs mt-1">{o.deliveryDriverName ?? "Sem entregador"}{o.deliveryStatus === "out_for_delivery" ? " · Em entrega" : o.deliveryStatus === "delivered" ? " · Entrega concluída" : ""}</p>}
                    </td>
                    <td className="px-5 py-3 text-[#a89a8c]">
                      {items.reduce((s, i) => s + i.qty, 0)} itens
                    </td>
                    <td className="px-5 py-3 text-[#ed1b24] font-semibold">{fmtR(o.totalCents)}</td>
                    <td className="px-5 py-3">
                      <select
                        value={o.status}
                        onChange={(e) => void updateOrder(o.id, { status: e.target.value })}
                        disabled={busy !== null}
                        aria-label={`Status do pedido ${o.id.slice(0, 8)}`}
                        className={`min-h-12 px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none ${st.color} bg-transparent`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.key} value={s.key} className="bg-[#1a1512] text-white">
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-[#a89a8c] text-xs">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
                        : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => setSelected(o)}
                        aria-label={`Ver pedido ${o.id.slice(0, 8)}`}
                        className="min-h-12 min-w-12 text-[#a89a8c] hover:text-white text-xs px-3 py-1.5 rounded-lg bg-[#241d18] hover:bg-[#352b24]">
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-[#a89a8c] text-sm px-5 py-8 text-center">Nenhum pedido.</p>
          )}
        </div>
      )}

      {/* Order detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Detalhes do pedido">
          <div className="print-area order-ticket bg-[#1a1512] rounded-2xl border border-[#352b24] w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="hidden print:block text-xs font-bold uppercase tracking-widest">Grupo Barbacue</p>
                <h2 className="text-lg font-bold text-white">Pedido #{selected.id.slice(0, 8).toUpperCase()}</h2>
                <p className="text-xs text-[#a89a8c]">{BRAND_LABEL[selected.brand] ?? "Barbacue"} · {channelLabel(selected.channel)}</p>
                {selected.channel === "test" && <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Pedido de teste</p>}
              </div>
              <button onClick={() => setSelected(null)} className="no-print min-w-12 min-h-12 text-[#a89a8c] hover:text-white text-2xl leading-none" aria-label="Fechar">×</button>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="bg-[#0e0b0a] rounded-xl p-4 flex flex-col gap-1">
                <p className="text-white font-semibold">{selected.customerName}</p>
                <p className="text-white">{destination(selected)}</p>
                <p className="text-[#a89a8c]">{selected.customerPhone}</p>
                {(selected.channel === "kiosk" || selected.channel === "table_qr") && <p className="text-[#c8b89a]">{selected.paymentMethod === "cash" ? "Dinheiro" : "Cartão"} no local · {selected.paymentStatus === "paid" ? "Pago" : "Pagamento pendente"}</p>}
                {selected.deliveryAddress && <p className="text-[#a89a8c]">{selected.deliveryAddress}</p>}
              </div>

              <div className="bg-[#0e0b0a] rounded-xl p-4 flex flex-col gap-2">
                {(Array.isArray(selected.items) ? selected.items : []).map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-[#a89a8c]">{item.qty}× {item.name}{item.notes && <small className="block text-[#c8b89a]">{item.notes}</small>}</span>
                    <span className="text-[#ed1b24]">{fmtR(item.priceCents * item.qty)}</span>
                  </div>
                ))}
                {(selected.discountCents ?? 0) > 0 && (
                  <div className="flex justify-between text-green-400 border-t border-[#352b24] pt-2">
                    <span>Desconto {selected.couponCode ? `(${selected.couponCode})` : ""}</span>
                    <span>-{fmtR(selected.discountCents ?? 0)}</span>
                  </div>
                )}
                {selected.orderType === "delivery" && <div className="flex justify-between text-[#c8b89a] border-t border-[#352b24] pt-2"><span>Frete</span><span>{fmtR(selected.deliveryFeeCents ?? 0)}</span></div>}
                <div className="flex justify-between font-bold text-white border-t border-[#352b24] pt-2">
                  <span>Total</span>
                  <span className="text-[#ed1b24]">{fmtR(selected.totalCents)}</span>
                </div>
              </div>

              {selected.notes && (
                <div className="bg-[#ed1b24]/10 border border-[#ed1b24]/30 rounded-xl p-4">
                  <p className="text-[#c8b89a] text-xs font-semibold mb-1">Observações</p>
                  <p className="text-[#f6efe8] text-sm">{selected.notes}</p>
                </div>
              )}

              {selected.channel === "ifood" && <p className="no-print text-sm text-[#c8b89a] leading-relaxed">As alterações deste painel são internas. Para confirmar, despachar ou cancelar no iFood, use também o gestor iFood.</p>}
              {selected.orderType === "delivery" && <section className="no-print bg-[#0e0b0a] rounded-xl p-4">
                <label className="block font-semibold text-white mb-2" htmlFor="assigned-driver">Entregador</label>
                <select id="assigned-driver" className="w-full min-h-12 bg-[#241d18] border border-[#352b24] text-white rounded-lg px-3 text-sm" value={selected.deliveryDriverId ?? ""} disabled={busy !== null || selected.deliveryStatus === "out_for_delivery" || selected.deliveryStatus === "delivered" || selected.status === "delivered" || selected.status === "cancelled"} onChange={event => void updateOrder(selected.id, { deliveryDriverId: event.target.value ? Number(event.target.value) : null })}>
                  <option value="">Sem entregador</option>
                  {selected.deliveryDriverId && !drivers.some(driver => driver.id === selected.deliveryDriverId) && <option value={selected.deliveryDriverId}>{selected.deliveryDriverName ?? "Entregador indisponível"} (indisponível)</option>}
                  {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                </select>
                <p className="text-[#a89a8c] text-xs leading-relaxed mt-2">{selected.deliveryStatus === "out_for_delivery" ? "O entregador já registrou a saída." : selected.deliveryStatus === "delivered" ? "Entrega concluída." : "O pedido aparece somente para o entregador escolhido. Ele registra a saída quando estiver pronto."}</p>
                {!!selected.deliveryDistanceMeters && <p className="text-[#c8b89a] text-xs mt-3">Trajeto: {(selected.deliveryDistanceMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km{selected.deliveryDurationSeconds ? ` · ${Math.ceil(selected.deliveryDurationSeconds / 60)} min` : ""}</p>}
                {selected.navigationLinks && <div className="flex flex-wrap gap-2 mt-3">{([['Google Maps', selected.navigationLinks.google], ['Apple Maps', selected.navigationLinks.apple], ['OpenStreetMap', selected.navigationLinks.osm]] as const).filter(([, url]) => url).map(([label, url]) => <a key={label} className="inline-flex min-h-12 items-center rounded-lg border border-[#352b24] px-3 text-xs text-[#c8b89a]" href={url!} target="_blank" rel="noopener noreferrer">{label}</a>)}</div>}
              </section>}
              {error && <p role="alert" className="no-print text-red-200 text-sm bg-red-950/50 p-3 rounded-lg">{error}</p>}

              <div className="no-print flex flex-col gap-1.5">
                <label className="text-[#a89a8c] text-xs">Status</label>
                <select value={selected.status}
                  onChange={(e) => void updateOrder(selected.id, { status: e.target.value })}
                  disabled={busy !== null}
                  className="min-h-12 bg-[#241d18] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="no-print mt-1 flex items-center justify-center gap-2 rounded-xl bg-[#ed1b24] hover:bg-[#c8141c] px-4 py-3 text-sm font-semibold text-white transition-colors"
              >
                <AdminIcon name="printer" size={17} />
                Imprimir pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
