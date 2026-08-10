"use client";

import { useEffect, useState } from "react";

interface OrderItem { name: string; priceCents: number; qty: number; }
interface Order {
  id: string; customerName: string; customerPhone: string;
  deliveryAddress: string | null; items: OrderItem[];
  subtotalCents: number | null; discountCents: number | null;
  totalCents: number; couponCode: string | null;
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

const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

function fmtR(cents: number) {
  return `R$${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState("");

  async function load() {
    const res = await fetch("/api/admin/orders");
    setOrders(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function changeStatus(orderId: string, status: string) {
    await fetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
    if (selected?.id === orderId) setSelected((o) => o ? { ...o, status } : null);
  }

  const filtered = filterStatus ? orders.filter((o) => o.status === filterStatus) : orders;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Pedidos</h1>
        <button onClick={load} className="text-[#a89a8c] hover:text-white text-sm px-4 py-2 rounded-xl bg-[#1a1512] border border-[#352b24]">
          ↻ Atualizar
        </button>
      </div>

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
        <div className="bg-[#1a1512] rounded-2xl border border-[#352b24] overflow-hidden">
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
                      <p className="text-white font-medium">{o.customerName}</p>
                      <p className="text-[#a89a8c] text-xs">{o.customerPhone}</p>
                    </td>
                    <td className="px-5 py-3 text-[#a89a8c]">
                      {items.reduce((s, i) => s + i.qty, 0)} itens
                    </td>
                    <td className="px-5 py-3 text-[#ed1b24] font-semibold">{fmtR(o.totalCents)}</td>
                    <td className="px-5 py-3">
                      <select
                        value={o.status}
                        onChange={(e) => changeStatus(o.id, e.target.value)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none ${st.color} bg-transparent`}
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
                        className="text-[#a89a8c] hover:text-white text-xs px-3 py-1.5 rounded-lg bg-[#241d18] hover:bg-[#352b24]">
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1512] rounded-2xl border border-[#352b24] w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Pedido</h2>
              <button onClick={() => setSelected(null)} className="text-[#a89a8c] hover:text-white text-2xl leading-none">×</button>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="bg-[#0e0b0a] rounded-xl p-4 flex flex-col gap-1">
                <p className="text-white font-semibold">{selected.customerName}</p>
                <p className="text-[#a89a8c]">{selected.customerPhone}</p>
                {selected.deliveryAddress && <p className="text-[#a89a8c]">{selected.deliveryAddress}</p>}
              </div>

              <div className="bg-[#0e0b0a] rounded-xl p-4 flex flex-col gap-2">
                {(Array.isArray(selected.items) ? selected.items : []).map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-[#a89a8c]">{item.qty}× {item.name}</span>
                    <span className="text-[#ed1b24]">{fmtR(item.priceCents * item.qty)}</span>
                  </div>
                ))}
                {(selected.discountCents ?? 0) > 0 && (
                  <div className="flex justify-between text-green-400 border-t border-[#352b24] pt-2">
                    <span>Desconto {selected.couponCode ? `(${selected.couponCode})` : ""}</span>
                    <span>-{fmtR(selected.discountCents ?? 0)}</span>
                  </div>
                )}
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

              <div className="flex flex-col gap-1.5">
                <label className="text-[#a89a8c] text-xs">Status</label>
                <select value={selected.status}
                  onChange={(e) => changeStatus(selected.id, e.target.value)}
                  className="bg-[#241d18] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
