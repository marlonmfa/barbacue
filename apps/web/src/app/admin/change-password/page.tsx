"use client";

import { useState } from "react";

export default function ChangePasswordPage() {
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) { setError("As senhas não coincidem."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password, confirmation, email }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Não foi possível alterar a senha."); return; }
      window.location.assign(data.redirect ?? "/admin");
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally { setLoading(false); }
  }

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    window.location.assign("/admin/login");
  }

  const inputClass = "bg-[#241d18] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24]";
  return (
    <div className="min-h-screen bg-[#0e0b0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#1a1512] rounded-2xl shadow-xl p-8">
        <h1 className="text-xl font-bold text-white">Crie sua nova senha</h1>
        <p className="text-[#a89a8c] text-sm mt-2 mb-6">No primeiro acesso, cadastre um e-mail alternativo e altere a senha inicial. Use ao menos 8 caracteres.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-[#a89a8c]">E-mail alternativo
            <input type="email" autoComplete="email" required maxLength={254} value={email} disabled={loading} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#a89a8c]">
            Senha atual
            <input type="password" autoComplete="current-password" required maxLength={256} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#a89a8c]">
            Nova senha
            <input type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#a89a8c]">
            Confirme a nova senha
            <input type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={inputClass} />
          </label>
          {error && <p role="alert" className="text-red-400 text-sm bg-red-900/30 rounded-xl px-4 py-2.5">{error}</p>}
          <button type="submit" disabled={loading} className="bg-[#ed1b24] hover:bg-[#c8141c] disabled:bg-[#5c1014] text-white font-semibold py-2.5 rounded-xl text-sm">{loading ? "Salvando..." : "Salvar nova senha"}</button>
          <button type="button" onClick={logout} className="text-[#a89a8c] text-sm">Sair</button>
        </form>
      </div>
    </div>
  );
}
