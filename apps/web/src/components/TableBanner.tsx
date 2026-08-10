"use client";

import { TABLE_COOKIE, type TableSession } from "@/lib/table-session-shared";

// Visible state of the QR/mesa flow:
//  • seated (table session present) → branded "you're at Mesa N" bar + leave action
//  • mesa=notfound query → invalid-QR notice
export function TableBanner({
  table,
  mesaParam,
}: {
  table: TableSession | null;
  mesaParam?: string;
}) {
  if (table) {
    function leave() {
      // Expire the (non-httpOnly) table cookie and reload back to delivery mode.
      document.cookie = `${TABLE_COOKIE}=; Max-Age=0; path=/`;
      window.location.href = "/";
    }
    return (
      <div className="bg-[var(--brand-red)]/15 border-y border-[var(--brand-red)]/40 text-[var(--text)]">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold">
            🍽️ Você está na <span className="text-[var(--brand-red)]">Mesa {table.number}</span>
            {table.label ? ` · ${table.label}` : ""} — peça direto da mesa!
          </span>
          <button
            onClick={leave}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline underline-offset-2 shrink-0"
          >
            Sair da mesa
          </button>
        </div>
      </div>
    );
  }

  if (mesaParam === "notfound") {
    return (
      <div className="bg-amber-50 border-y border-amber-300 text-amber-800">
        <div className="max-w-5xl mx-auto px-4 py-2.5 text-sm font-medium">
          ⚠️ QR Code inválido ou mesa desativada. Chame um atendente ou peça para entrega.
        </div>
      </div>
    );
  }

  return null;
}
