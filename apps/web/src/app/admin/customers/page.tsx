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
        className="w-full bg-[#1a1512] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#ed1b24] placeholder-[#7c6f61]"
      />

      {loading ? (
        <p className="text-[#a89a8c] text-sm">Carregando...</p>
      ) : (
        <div className="bg-[#1a1512] rounded-2xl border border-[#352b24] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#0e0b0a] text-[#a89a8c] text-left">
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Telefone</th>
                <th className="px-5 py-3">Endereço</th>
                <th className="px-5 py-3">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-[#352b24]">
                  <td className="px-5 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-[#a89a8c]">{c.phone}</td>
                  <td className="px-5 py-3 text-[#a89a8c]">{c.address ?? "—"}</td>
                  <td className="px-5 py-3 text-[#a89a8c] text-xs">
                    {c.createdAt
                      ? new Date(c.createdAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-[#a89a8c] text-sm px-5 py-8 text-center">
              {search ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
