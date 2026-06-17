"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmationContent() {
  const params = useSearchParams();
  const orderId = params.get("id");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="text-6xl animate-bounce">🎉</div>
      <h1 className="text-2xl font-bold text-[var(--text)]">Pedido confirmado!</h1>
      <p className="text-[var(--text-muted)] max-w-sm">
        Recebemos seu pedido. Em breve entraremos em contato para confirmar a entrega.
      </p>
      {orderId && (
        <p className="text-xs text-[var(--text-muted)] font-mono bg-[var(--surface-2)] px-3 py-1.5 rounded-lg">
          #{orderId.slice(0, 8).toUpperCase()}
        </p>
      )}
      <Link
        href="/"
        className="bg-[var(--brand-red)] hover:bg-[var(--brand-red-hover)] text-white font-semibold px-6 py-3 rounded-2xl transition-colors"
      >
        Fazer novo pedido
      </Link>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense>
      <ConfirmationContent />
    </Suspense>
  );
}
