"use client";
import { useState } from "react";
export function CustomerLogout() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  async function logout() { setBusy(true); setError(false); try { const res = await fetch("/api/account", { method: "DELETE" }); if (!res.ok) throw new Error(); window.location.assign("/"); } catch { setError(true); setBusy(false); } }
  return <span><button disabled={busy} onClick={() => void logout()} className="underline">{busy ? "Saindo…" : "Sair da conta"}</button>{error && <span role="alert"> Não foi possível sair. Tente novamente.</span>}</span>;
}
