"use client";

import { useEffect, useState } from "react";

interface Staff {
  id: number;
  name: string;
  username: string;
  role: "admin" | "manager";
  active: boolean;
  createdAt: string | null;
}

const EMPTY_FORM = {
  name: "",
  username: "",
  password: "",
  role: "manager" as "admin" | "manager",
  active: true,
};

export default function AdminStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/staff");
    if (res.status === 403) {
      setDenied(true);
      setLoading(false);
      return;
    }
    setStaff(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(s: Staff) {
    setEditing(s.id);
    // Password left blank on edit = keep current password.
    setForm({ name: s.name, username: s.username, password: "", role: s.role, active: s.active });
    setError(null);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const url = editing ? `/api/admin/staff/${editing}` : "/api/admin/staff";
    // On edit, omit an empty password so the existing one is preserved.
    const payload: Record<string, unknown> = editing
      ? { name: form.name, role: form.role, active: form.active }
      : { name: form.name, username: form.username, password: form.password, role: form.role, active: form.active };
    if (editing && form.password) payload.password = form.password;

    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Erro ao salvar");
      return;
    }
    setShowForm(false);
    load();
  }

  async function toggleActive(s: Staff) {
    await fetch(`/api/admin/staff/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir esta conta?")) return;
    await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
    load();
  }

  if (denied) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-3">Equipe</h1>
        <p className="text-[#a89a8c] text-sm">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Equipe</h1>
          <p className="text-[#a89a8c] text-sm mt-1">Contas de administradores e gerentes.</p>
        </div>
        <button onClick={openCreate}
          className="bg-[#ed1b24] hover:bg-[#c8141c] text-white text-sm font-semibold px-4 py-2 rounded-xl">
          + Nova conta
        </button>
      </div>

      {loading ? <p className="text-[#a89a8c] text-sm">Carregando...</p> : (
        <div className="bg-[#1a1512] rounded-2xl border border-[#352b24] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#0e0b0a] text-[#a89a8c] text-left">
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">Papel</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-[#352b24]">
                  <td className="px-5 py-3 text-white">{s.name}</td>
                  <td className="px-5 py-3"><span className="font-mono text-[#c8b89a]">{s.username}</span></td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      s.role === "admin" ? "bg-[#ed1b24]/20 text-[#ed1b24]" : "bg-sky-500/20 text-sky-300"
                    }`}>
                      {s.role === "admin" ? "Administrador" : "Gerente"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggleActive(s)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        s.active ? "bg-green-500/20 text-green-300 hover:bg-red-500/20 hover:text-red-300"
                                 : "bg-red-500/20 text-red-300 hover:bg-green-500/20 hover:text-green-300"
                      }`}>
                      {s.active ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-5 py-3 flex gap-2">
                    <button onClick={() => openEdit(s)}
                      className="text-[#a89a8c] hover:text-white text-xs px-3 py-1.5 rounded-lg bg-[#241d18] hover:bg-[#352b24]">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="text-red-400 text-xs px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {staff.length === 0 && (
            <p className="text-[#a89a8c] text-sm px-5 py-8 text-center">
              Nenhuma conta cadastrada. Você está usando o login mestre (senha do .env).
            </p>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1512] rounded-2xl border border-[#352b24] w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-5">
              {editing ? "Editar conta" : "Nova conta"}
            </h2>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <F label="Nome *">
                <input required className={ic} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </F>
              <F label="Usuário *">
                <input required disabled={!!editing} className={ic} value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
              </F>
              <F label={editing ? "Nova senha (vazio = manter)" : "Senha *"}>
                <input type="password" required={!editing} minLength={6} className={ic} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </F>
              <F label="Papel">
                <select className={ic} value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "manager" })}>
                  <option value="manager">Gerente</option>
                  <option value="admin">Administrador</option>
                </select>
              </F>
              <label className="flex items-center gap-2 text-sm text-[#a89a8c] cursor-pointer">
                <input type="checkbox" checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Conta ativa
              </label>
              {error && <p className="text-red-400 text-sm bg-red-900/30 rounded-xl px-4 py-2.5">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#352b24] text-[#a89a8c] text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#ed1b24] hover:bg-[#c8141c] text-white font-semibold text-sm disabled:opacity-50">
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
      <label className="text-sm text-[#a89a8c]">{label}</label>
      {children}
    </div>
  );
}

const ic = "bg-[#241d18] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] w-full disabled:opacity-50";
