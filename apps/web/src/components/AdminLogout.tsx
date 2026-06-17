"use client";

import { useRouter } from "next/navigation";

export function AdminLogout() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-400 hover:text-red-400 text-sm transition-colors w-full text-left"
    >
      <span>🚪</span>
      <span>Sair</span>
    </button>
  );
}
