"use client";

import { useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";

export function AdminLogout() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function handleLogout() {
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/admin/auth", { method: "DELETE" });
      if (!response.ok) throw new Error();
      window.location.assign("/admin/login");
    } catch { setError(true); setBusy(false); }
  }

  return (
    <button
      disabled={busy}
      onClick={handleLogout}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-400 hover:text-red-400 text-sm transition-colors w-full text-left"
    >
      <AdminIcon name="logout" size={17} />
      <span>{busy ? "Saindo…" : error ? "Tentar sair novamente" : "Sair"}</span>
    </button>
  );
}
