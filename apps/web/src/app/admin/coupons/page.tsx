"use client";

import { useEffect, useState } from "react";

interface Coupon {
  id: number; code: string; description: string | null;
  discountType: "flat" | "percentage"; discountValue: number;
  minOrderCents: number | null; maxUsages: number | null; usedCount: number | null;
  active: boolean; expiresAt: string | null; createdAt: string | null;
}

const EMPTY_FORM = {
  code: "", description: "", discountType: "flat" as "flat" | "percentage",
  discountValue: 0, minOrderCents: 0, maxUsages: "", active: true, expiresAt: "",
};

function fmtCents(n: number) {
  return `R$${(n / 100).toFixed(2).replace(".", ",")}`;
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/coupons");
    setCoupons(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: Coupon) {
    setEditing(c.id);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderCents: c.minOrderCents ?? 0,
      maxUsages: c.maxUsages !== null ? String(c.maxUsages) : "",
      active: c.active,
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 16) : "",
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      discountValue: form.discountType === "flat"
        ? Math.round(form.discountValue * 100)
        : form.discountValue,
      maxUsages: form.maxUsages !== "" ? Number(form.maxUsages) : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };
    const url = editing ? `/api/admin/coupons/${editing}` : "/api/admin/coupons";
    await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function toggleActive(c: Coupon) {
    await fetch(`/api/admin/coupons/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir cupom?")) return;
    await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Cupons</h1>
        <button onClick={openCreate}
          className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
          + Novo cupom
        </button>
      </div>

      {loading ? <p className="text-neutral-400 text-sm">Carregando...</p> : (
        <div className="bg-neutral-800 rounded-2xl border border-neutral-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-left">
              <tr>
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Desconto</th>
                <th className="px-5 py-3">Pedido mín.</th>
                <th className="px-5 py-3">Usos</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-t border-neutral-700">
                  <td className="px-5 py-3">
                    <span className="font-mono font-bold text-amber-300">{c.code}</span>
                    {c.description && <p className="text-neutral-500 text-xs">{c.description}</p>}
                  </td>
                  <td className="px-5 py-3 text-white">
                    {c.discountType === "flat"
                      ? fmtCents(c.discountValue)
                      : `${c.discountValue}%`}
                  </td>
                  <td className="px-5 py-3 text-neutral-300">
                    {c.minOrderCents ? fmtCents(c.minOrderCents) : "—"}
                  </td>
                  <td className="px-5 py-3 text-neutral-300">
                    {c.usedCount ?? 0}{c.maxUsages !== null ? ` / ${c.maxUsages}` : ""}
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggleActive(c)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        c.active ? "bg-green-500/20 text-green-300 hover:bg-red-500/20 hover:text-red-300"
                                 : "bg-red-500/20 text-red-300 hover:bg-green-500/20 hover:text-green-300"
                      }`}>
                      {c.active ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-5 py-3 flex gap-2">
                    <button onClick={() => openEdit(c)}
                      className="text-neutral-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="text-red-400 text-xs px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {coupons.length === 0 && (
            <p className="text-neutral-400 text-sm px-5 py-8 text-center">Nenhum cupom cadastrado.</p>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-5">
              {editing ? "Editar cupom" : "Novo cupom"}
            </h2>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <F label="Código *">
                <input required className={ic} value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
              </F>
              <F label="Descrição">
                <input className={ic} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </F>
              <F label="Tipo de desconto">
                <select className={ic} value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value as "flat" | "percentage" })}>
                  <option value="flat">Valor fixo (R$)</option>
                  <option value="percentage">Porcentagem (%)</option>
                </select>
              </F>
              <F label={`Valor do desconto ${form.discountType === "flat" ? "(R$)" : "(%)"} *`}>
                <input required type="number" min={0.01} step={form.discountType === "flat" ? 0.01 : 1}
                  max={form.discountType === "percentage" ? 100 : undefined}
                  className={ic} value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} />
              </F>
              <F label="Pedido mínimo (R$)">
                <input type="number" min={0} step={0.01} className={ic}
                  value={form.minOrderCents / 100}
                  onChange={(e) => setForm({ ...form, minOrderCents: Math.round(Number(e.target.value) * 100) })} />
              </F>
              <F label="Limite de usos (vazio = ilimitado)">
                <input type="number" min={1} className={ic} value={form.maxUsages}
                  onChange={(e) => setForm({ ...form, maxUsages: e.target.value })} />
              </F>
              <F label="Expira em">
                <input type="datetime-local" className={ic} value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </F>
              <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                <input type="checkbox" checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Cupom ativo
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-neutral-600 text-neutral-300 text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-50">
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

const ic = "bg-neutral-700 border border-neutral-600 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-full";
