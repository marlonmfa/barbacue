"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Customer = {
  id: number;
  name: string;
  phone: string;
  address: string | null;
  email: string | null;
};

export default function ImpersonatePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  });

  async function handleImpersonate() {
    if (!selected || !masterPassword) return;
    setError(null);
    setLoading(true);

    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: selected.id, masterPassword }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erro ao impersonar");
      setLoading(false);
      return;
    }

    // Redirect to storefront as this customer
    router.push("/");
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Impersonar Cliente</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Abre o site pré-preenchido com os dados do cliente selecionado.
          Requer a senha mestra.
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
          placeholder="Buscar por nome, telefone ou email..."
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-neutral-500"
        />
      </div>

      {/* Customer list */}
      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden mb-6 max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-8">
            {customers.length === 0 ? "Carregando..." : "Nenhum cliente encontrado"}
          </p>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(selected?.id === c.id ? null : c)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-800 last:border-0 flex items-center justify-between gap-4 transition-colors ${
                selected?.id === c.id
                  ? "bg-amber-500/20 border-l-2 border-l-amber-500"
                  : "hover:bg-neutral-800"
              }`}
            >
              <div>
                <p className="text-white text-sm font-medium">{c.name}</p>
                <p className="text-neutral-400 text-xs mt-0.5">{c.phone}</p>
                {c.address && <p className="text-neutral-500 text-xs truncate max-w-xs">{c.address}</p>}
              </div>
              {selected?.id === c.id && (
                <span className="text-amber-400 text-xs font-semibold shrink-0">✓ Selecionado</span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Confirmation panel */}
      {selected && (
        <div className="bg-neutral-900 border border-amber-500/30 rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-1">
              Cliente selecionado
            </p>
            <p className="text-white font-semibold">{selected.name}</p>
            <p className="text-neutral-400 text-sm">{selected.phone}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-300">Senha mestra</label>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => { setMasterPassword(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleImpersonate()}
              placeholder="••••••••••••"
              className="bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-neutral-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 rounded-xl px-4 py-2.5">{error}</p>
          )}

          <button
            onClick={handleImpersonate}
            disabled={loading || !masterPassword}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-800 disabled:text-amber-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <span>👤</span>
            {loading ? "Abrindo..." : `Entrar como ${selected.name}`}
          </button>
        </div>
      )}
    </div>
  );
}
