"use client";

import { useEffect, useState } from "react";

interface Customer {
  id: number; name: string; phone: string; email: string | null;
  address: string | null; notes: string | null; createdAt: string | null;
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then((d) => { setCustomers(d); setLoading(false); });
  }, []);

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Clientes</h1>

      <input
        type="search"
        placeholder="Buscar por nome ou telefone..."
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
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Telefone</th>
                <th className="px-5 py-3">Endereço</th>
                <th className="px-5 py-3">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-neutral-700">
                  <td className="px-5 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-neutral-300">{c.phone}</td>
                  <td className="px-5 py-3 text-neutral-400">{c.address ?? "—"}</td>
                  <td className="px-5 py-3 text-neutral-500 text-xs">
                    {c.createdAt
                      ? new Date(c.createdAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-neutral-400 text-sm px-5 py-8 text-center">
              {search ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
