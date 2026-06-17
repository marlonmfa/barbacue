"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Category { id: number; name: string; slug: string; }
interface Product {
  id: number; categoryId: number | null; name: string;
  description: string | null; priceCents: number;
  imageUrl: string | null; available: boolean; sortOrder: number | null;
}

const EMPTY_FORM = {
  categoryId: 0, name: "", description: "", priceCents: 0,
  imageUrl: "", available: true, sortOrder: 0,
};

function fmt(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default function AdminProducts() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    const res = await fetch("/api/admin/products");
    const data = await res.json();
    setCategories(data.categories ?? []);
    setProducts(data.products ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? 0 });
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p.id);
    setForm({
      categoryId: p.categoryId ?? 0,
      name: p.name,
      description: p.description ?? "",
      priceCents: p.priceCents,
      imageUrl: p.imageUrl ?? "",
      available: p.available,
      sortOrder: p.sortOrder ?? 0,
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      ...form,
      imageUrl: form.imageUrl || null,
      description: form.description || null,
    };
    const url = editing ? `/api/admin/products/${editing}` : "/api/admin/products";
    const method = editing ? "PATCH" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function toggleAvailable(p: Product) {
    await fetch(`/api/admin/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !p.available }),
    });
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir produto?")) return;
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    load();
  }

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Produtos</h1>
        <button
          onClick={openCreate}
          className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          + Novo produto
        </button>
      </div>

      <input
        type="search"
        placeholder="Buscar produto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-neutral-500"
      />

      {loading ? (
        <p className="text-neutral-400 text-sm">Carregando...</p>
      ) : (
        <div className="bg-neutral-800 rounded-2xl border border-neutral-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-left">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Preço</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-neutral-700 hover:bg-neutral-750">
                  <td className="px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-700 flex-shrink-0">
                      {p.imageUrl ? (
                        <Image src={p.imageUrl} alt={p.name} width={40} height={40} className="object-cover w-full h-full" unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">🍔</div>
                      )}
                    </div>
                    <div>
                      <p className="text-white font-medium">{p.name}</p>
                      {p.description && (
                        <p className="text-neutral-500 text-xs line-clamp-1">{p.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{catMap[p.categoryId ?? 0] ?? "—"}</td>
                  <td className="px-4 py-3 text-amber-400 font-semibold">R${fmt(p.priceCents)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAvailable(p)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        p.available
                          ? "bg-green-500/20 text-green-300 hover:bg-red-500/20 hover:text-red-300"
                          : "bg-red-500/20 text-red-300 hover:bg-green-500/20 hover:text-green-300"
                      }`}
                    >
                      {p.available ? "Disponível" : "Indisponível"}
                    </button>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-neutral-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-red-400 hover:text-red-300 text-xs px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 transition-colors"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-neutral-400 text-sm px-5 py-8 text-center">Nenhum produto encontrado.</p>
          )}
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-5">
              {editing ? "Editar produto" : "Novo produto"}
            </h2>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <Field label="Nome *">
                <input required className={inputCls} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>

              <Field label="Categoria *">
                <select required className={inputCls} value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Descrição">
                <textarea rows={3} className={inputCls} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>

              <Field label="Preço (R$) *">
                <input required type="number" min={0.01} step={0.01} className={inputCls}
                  value={(form.priceCents / 100).toFixed(2)}
                  onChange={(e) => setForm({ ...form, priceCents: Math.round(parseFloat(e.target.value || "0") * 100) })} />
              </Field>

              <Field label="URL da imagem">
                <input type="url" className={inputCls} value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
              </Field>

              <Field label="Ordem">
                <input type="number" className={inputCls} value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </Field>

              <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                <input type="checkbox" checked={form.available}
                  onChange={(e) => setForm({ ...form, available: e.target.checked })}
                  className="rounded" />
                Disponível no cardápio
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-neutral-600 text-neutral-300 hover:text-white text-sm transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors disabled:opacity-50">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "bg-neutral-700 border border-neutral-600 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-neutral-500 w-full";
