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
  { key: "delivered", label: "Entregue",   color: "bg-neutral-500/20 text-neutral-400" },
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
        <button onClick={load} className="text-neutral-400 hover:text-white text-sm px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700">
          ↻ Atualizar
        </button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setFilterStatus("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!filterStatus ? "bg-amber-500 text-white" : "bg-neutral-800 text-neutral-400 border border-neutral-700"}`}>
          Todos ({orders.length})
        </button>
        {STATUSES.map((s) => {
          const n = orders.filter((o) => o.status === s.key).length;
          return (
            <button key={s.key} onClick={() => setFilterStatus(s.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === s.key ? "bg-amber-500 text-white" : "bg-neutral-800 text-neutral-400 border border-neutral-700"}`}>
              {s.label} ({n})
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-neutral-400 text-sm">Carregando...</p>
      ) : (
        <div className="bg-neutral-800 rounded-2xl border border-neutral-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-left">
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
                  <tr key={o.id} className="border-t border-neutral-700 hover:bg-neutral-750">
                    <td className="px-5 py-3">
                      <p className="text-white font-medium">{o.customerName}</p>
                      <p className="text-neutral-500 text-xs">{o.customerPhone}</p>
                    </td>
                    <td className="px-5 py-3 text-neutral-300">
                      {items.reduce((s, i) => s + i.qty, 0)} itens
                    </td>
                    <td className="px-5 py-3 text-amber-400 font-semibold">{fmtR(o.totalCents)}</td>
                    <td className="px-5 py-3">
                      <select
                        value={o.status}
                        onChange={(e) => changeStatus(o.id, e.target.value)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none ${st.color} bg-transparent`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.key} value={s.key} className="bg-neutral-800 text-white">
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-neutral-400 text-xs">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
                        : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => setSelected(o)}
                        className="text-neutral-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600">
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-neutral-400 text-sm px-5 py-8 text-center">Nenhum pedido.</p>
          )}
        </div>
      )}

      {/* Order detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Pedido</h2>
              <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="bg-neutral-900 rounded-xl p-4 flex flex-col gap-1">
                <p className="text-white font-semibold">{selected.customerName}</p>
                <p className="text-neutral-400">{selected.customerPhone}</p>
                {selected.deliveryAddress && <p className="text-neutral-400">{selected.deliveryAddress}</p>}
              </div>

              <div className="bg-neutral-900 rounded-xl p-4 flex flex-col gap-2">
                {(Array.isArray(selected.items) ? selected.items : []).map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-neutral-300">{item.qty}× {item.name}</span>
                    <span className="text-amber-400">{fmtR(item.priceCents * item.qty)}</span>
                  </div>
                ))}
                {(selected.discountCents ?? 0) > 0 && (
                  <div className="flex justify-between text-green-400 border-t border-neutral-700 pt-2">
                    <span>Desconto {selected.couponCode ? `(${selected.couponCode})` : ""}</span>
                    <span>-{fmtR(selected.discountCents ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-white border-t border-neutral-700 pt-2">
                  <span>Total</span>
                  <span className="text-amber-400">{fmtR(selected.totalCents)}</span>
                </div>
              </div>

              {selected.notes && (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4">
                  <p className="text-amber-300 text-xs font-semibold mb-1">Observações</p>
                  <p className="text-amber-100 text-sm">{selected.notes}</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-neutral-400 text-xs">Status</label>
                <select value={selected.status}
                  onChange={(e) => changeStatus(selected.id, e.target.value)}
                  className="bg-neutral-700 border border-neutral-600 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none">
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
