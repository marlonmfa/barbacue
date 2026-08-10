"use client";

import { useEffect, useState } from "react";

interface BetaSignup {
  id: number;
  name: string;
  whatsapp: string;
  email: string;
  platform: "ios" | "android";
  createdAt: string | null;
}

// "5511988887777" → "(11) 98888-7777" for display.
function formatWhatsapp(digits: string) {
  const national = digits.startsWith("55") ? digits.slice(2) : digits;
  const ddd = national.slice(0, 2);
  const num = national.slice(2);
  const split = num.length - 4;
  return `(${ddd}) ${num.slice(0, split)}-${num.slice(split)}`;
}

export default function AdminBeta() {
  const [signups, setSignups] = useState<BetaSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/beta")
      .then((r) => r.json())
      .then((d) => { setSignups(d); setLoading(false); });
  }, []);

  const filtered = signups.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.whatsapp.includes(search.replace(/\D/g, "") || search) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const iosCount = signups.filter((s) => s.platform === "ios").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Beta do App</h1>
        <p className="text-sm text-[#a89a8c]">
          {signups.length} inscritos · 🍎 {iosCount} · 🤖 {signups.length - iosCount}
        </p>
      </div>

      <input
        type="search"
        placeholder="Buscar por nome, WhatsApp ou e-mail..."
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
                <th className="px-5 py-3">WhatsApp</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Celular</th>
                <th className="px-5 py-3">Inscrição</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-[#352b24]">
                  <td className="px-5 py-3 text-white font-medium">{s.name}</td>
                  <td className="px-5 py-3 text-[#a89a8c]">
                    <a
                      href={`https://wa.me/${s.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-white underline decoration-dotted underline-offset-2"
                    >
                      {formatWhatsapp(s.whatsapp)}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-[#a89a8c]">{s.email}</td>
                  <td className="px-5 py-3 text-[#a89a8c]">
                    {s.platform === "ios" ? "🍎 iPhone" : "🤖 Android"}
                  </td>
                  <td className="px-5 py-3 text-[#a89a8c] text-xs">
                    {s.createdAt
                      ? new Date(s.createdAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-[#a89a8c] text-sm px-5 py-8 text-center">
              {search ? "Nenhum inscrito encontrado." : "Nenhum inscrito ainda — divulgue /beta."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
