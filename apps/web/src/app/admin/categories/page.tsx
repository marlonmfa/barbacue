"use client";

import { useEffect, useState } from "react";

interface Category { id: number; name: string; slug: string; sortOrder: number | null; }

const EMPTY_FORM = { name: "", slug: "", sortOrder: 0 };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/categories");
    setCategories(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: Category) {
    setEditing(c.id);
    setForm({ name: c.name, slug: c.slug, sortOrder: c.sortOrder ?? 0 });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const url = editing ? `/api/admin/categories/${editing}` : "/api/admin/categories";
    await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir categoria? Os produtos desta categoria não serão deletados.")) return;
    await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Categorias</h1>
        <button
          onClick={openCreate}
          className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          + Nova categoria
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-400 text-sm">Carregando...</p>
      ) : (
        <div className="bg-neutral-800 rounded-2xl border border-neutral-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-left">
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Slug</th>
                <th className="px-5 py-3">Ordem</th>
                <th className="px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-t border-neutral-700">
                  <td className="px-5 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-neutral-400 font-mono text-xs">{c.slug}</td>
                  <td className="px-5 py-3 text-neutral-400">{c.sortOrder ?? 0}</td>
                  <td className="px-5 py-3 flex gap-2">
                    <button onClick={() => openEdit(c)}
                      className="text-neutral-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition-colors">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="text-red-400 hover:text-red-300 text-xs px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 transition-colors">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.length === 0 && (
            <p className="text-neutral-400 text-sm px-5 py-8 text-center">Nenhuma categoria cadastrada.</p>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-white mb-5">
              {editing ? "Editar categoria" : "Nova categoria"}
            </h2>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-neutral-400">Nome *</label>
                <input required className={ic} value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({ ...f, name, slug: editing ? f.slug : slugify(name) }));
                  }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-neutral-400">Slug *</label>
                <input required className={ic} value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-neutral-400">Ordem</label>
                <input type="number" className={ic} value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-neutral-600 text-neutral-300 hover:text-white text-sm">
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

const ic = "bg-neutral-700 border border-neutral-600 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-full";
