"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push("/admin");
    } else {
      const data = await res.json();
      setError(data.error ?? "Erro ao entrar");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0b0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#1a1512] rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <span className="text-4xl">🔥</span>
          <h1 className="text-xl font-bold text-white mt-3">Painel Admin</h1>
          <p className="text-[#a89a8c] text-sm mt-1">Barbacue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#a89a8c]" htmlFor="user">
              Usuário <span className="text-[#a89a8c]">(deixe vazio p/ senha mestre)</span>
            </label>
            <input
              id="user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="gerente"
              className="bg-[#241d18] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] placeholder-[#7c6f61]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#a89a8c]" htmlFor="pw">
              Senha
            </label>
            <input
              id="pw"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-[#241d18] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] placeholder-[#7c6f61]"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-[#ed1b24] hover:bg-[#c8141c] disabled:bg-[#5c1014] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
