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
        <p className="text-[#a89a8c] text-sm mt-1">
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
          className="w-full bg-[#1a1512] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] placeholder-[#7c6f61]"
        />
      </div>

      {/* Customer list */}
      <div className="bg-[#0e0b0a] rounded-2xl border border-[#352b24] overflow-hidden mb-6 max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-[#a89a8c] text-sm text-center py-8">
            {customers.length === 0 ? "Carregando..." : "Nenhum cliente encontrado"}
          </p>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(selected?.id === c.id ? null : c)}
              className={`w-full text-left px-4 py-3 border-b border-[#352b24] last:border-0 flex items-center justify-between gap-4 transition-colors ${
                selected?.id === c.id
                  ? "bg-[#ed1b24]/20 border-l-2 border-l-[#ed1b24]"
                  : "hover:bg-[#1a1512]"
              }`}
            >
              <div>
                <p className="text-white text-sm font-medium">{c.name}</p>
                <p className="text-[#a89a8c] text-xs mt-0.5">{c.phone}</p>
                {c.address && <p className="text-[#a89a8c] text-xs truncate max-w-xs">{c.address}</p>}
              </div>
              {selected?.id === c.id && (
                <span className="text-[#ed1b24] text-xs font-semibold shrink-0">✓ Selecionado</span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Confirmation panel */}
      {selected && (
        <div className="bg-[#0e0b0a] border border-[#ed1b24]/30 rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-[#ed1b24] text-xs font-semibold uppercase tracking-widest mb-1">
              Cliente selecionado
            </p>
            <p className="text-white font-semibold">{selected.name}</p>
            <p className="text-[#a89a8c] text-sm">{selected.phone}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#a89a8c]">Senha mestra</label>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => { setMasterPassword(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleImpersonate()}
              placeholder="••••••••••••"
              className="bg-[#1a1512] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] placeholder-[#7c6f61]"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 rounded-xl px-4 py-2.5">{error}</p>
          )}

          <button
            onClick={handleImpersonate}
            disabled={loading || !masterPassword}
            className="bg-[#ed1b24] hover:bg-[#c8141c] disabled:bg-[#5a1014] disabled:text-[#a8585c] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <span>👤</span>
            {loading ? "Abrindo..." : `Entrar como ${selected.name}`}
          </button>
        </div>
      )}
    </div>
  );
}
