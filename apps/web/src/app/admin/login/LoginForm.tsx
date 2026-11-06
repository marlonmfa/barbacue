"use client";

import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      const data = await res.json();
      // Use a full navigation after authentication. This guarantees the new
      // httpOnly session cookie is applied before the protected admin request
      // and avoids a stuck client transition after production redeploys.
      window.location.assign(data.mustChangePassword ? "/admin/change-password" : "/admin");
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
          <BrandLogo
            brand="barbacue"
            alt="Barbacue & Co"
            width={160}
            height={160}
            preload
            className="mx-auto h-40 w-40 rounded-xl object-contain"
          />
          <h1 className="text-xl font-bold text-white mt-3">Acesso da equipe</h1>
          <p className="text-[#a89a8c] text-sm mt-1">Barbacue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#a89a8c]" htmlFor="user">
              Usuário ou e-mail
            </label>
            <input
              id="user"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ex.: marlon ou seu e-mail"
              autoCapitalize="none"
              spellCheck={false}
              className="bg-[#241d18] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] placeholder-[#7c6f61]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#a89a8c]" htmlFor="pw">
              Senha
            </label>
            <div className="relative">
            <input
              id="pw"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#241d18] border border-[#352b24] text-white rounded-xl pl-4 pr-12 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] placeholder-[#7c6f61]"
            />
              <button type="button" onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword} aria-controls="pw"
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-[#a89a8c] hover:text-white focus-visible:outline-2 focus-visible:outline-[#ed1b24]">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="m3 3 18 18" />}
                </svg>
              </button>
            </div>
          </div>

          <p className="text-xs text-[#a89a8c]">Seu acesso fica salvo neste navegador. Use Sair para encerrar.</p>

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
          <button type="button" className="text-sm text-[#a89a8c] underline hover:text-white" onClick={() => window.location.assign(window.location.hostname === 'barbacue.cog.ia.br' ? 'https://cog.ia.br/api/sso/entrar?destino=https%3A%2F%2Fbarbacue.cog.ia.br%2Fadmin' : '/api/auth/cog/start?interactive=1&next=/admin')}>
            Entrar com a conta COG
          </button>
        </form>
      </div>
    </div>
  );
}
