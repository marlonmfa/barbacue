"use client";

import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";

interface Table {
  id: number;
  number: number;
  label: string | null;
  token: string;
  active: boolean;
}

export default function AdminTables() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<Record<number, string>>({});
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/tables");
    if (res.ok) setTables(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Build a QR data URL per table pointing at /mesa/<token>.
  useEffect(() => {
    if (!origin) return;
    tables.forEach((t) => {
      QRCode.toDataURL(`${origin}/mesa/${t.token}`, { width: 320, margin: 1 })
        .then((url) => setQr((q) => ({ ...q, [t.id]: url })))
        .catch(() => {});
    });
  }, [tables, origin]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: Number(number), label: label.trim() || null }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message ?? "Erro ao criar mesa.");
      return;
    }
    setNumber("");
    setLabel("");
    load();
  }

  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/tables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message ?? "Erro ao atualizar.");
      return;
    }
    load();
  }

  async function remove(id: number) {
    if (!confirm("Remover esta mesa? O QR impresso deixará de funcionar.")) return;
    await fetch(`/api/admin/tables/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-2xl font-bold">Mesas</h1>
          <p className="text-[#a89a8c] text-sm mt-1">
            Cada mesa tem um QR Code. O cliente escaneia, é &quot;sentado&quot; na mesa e pede direto pelo cardápio.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-[#241d18] hover:bg-[#352b24] border border-[#352b24] text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          🖨️ Imprimir QRs
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#352b24] p-4 no-print">
        <p className="flex-1 text-sm text-[#c8b89a]">Abra o autoatendimento no tablet. No balcão, o cliente informa o nome para retirar; nas mesas, use o link de cada mesa.</p>
        <a href="/totem" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#ed1b24] px-4 py-3 text-sm font-semibold text-white">Abrir totem do balcão</a>
      </div>

      {error && <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-4 py-2.5 mb-4 no-print">{error}</p>}

      {/* Create */}
      <form onSubmit={create} className="flex flex-wrap items-end gap-3 mb-6 bg-[#1a1512] border border-[#352b24] rounded-2xl p-4 no-print">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#a89a8c]">Número *</label>
          <input
            type="number" required min={1} value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="w-24 bg-[#241d18] border border-[#352b24] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs text-[#a89a8c]">Apelido (opcional)</label>
          <input
            type="text" value={label} placeholder="Varanda, Balcão..."
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-[#241d18] border border-[#352b24] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
          />
        </div>
        <button className="bg-[#ed1b24] hover:bg-[#c8141c] text-white text-sm font-semibold px-5 py-2 rounded-lg">
          + Adicionar mesa
        </button>
      </form>

      {loading ? (
        <p className="text-[#a89a8c]">Carregando...</p>
      ) : tables.length === 0 ? (
        <p className="text-[#a89a8c]">Nenhuma mesa cadastrada ainda.</p>
      ) : (
        <div className="print-area grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((t) => (
            <div
              key={t.id}
              className={`bg-[#1a1512] border rounded-2xl p-4 flex flex-col items-center gap-3 ${t.active ? "border-[#352b24]" : "border-[#352b24] opacity-60"}`}
            >
              <div className="w-full flex items-center justify-between no-print">
                <span className="font-bold text-lg">Mesa {t.number}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.active ? "bg-green-900/50 text-green-300" : "bg-neutral-800 text-neutral-400"}`}>
                  {t.active ? "Ativa" : "Inativa"}
                </span>
              </div>

              {/* Printable card */}
              <div className="bg-white rounded-xl p-4 flex flex-col items-center gap-2 w-full">
                {qr[t.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr[t.id]} alt={`QR Mesa ${t.number}`} className="w-44 h-44" />
                ) : (
                  <div className="w-44 h-44 bg-neutral-200 animate-pulse rounded" />
                )}
                <p className="text-black font-extrabold text-xl">MESA {t.number}</p>
                {t.label && <p className="text-neutral-600 text-sm -mt-1">{t.label}</p>}
                <p className="text-neutral-700 text-xs text-center">Escaneie para ver o cardápio e pedir 🍔🔥</p>
                <p className="text-neutral-400 text-[10px]">Barbacue</p>
              </div>

              {/* Controls */}
              <div className="w-full flex flex-wrap gap-2 no-print">
                {t.active && <a href={`/totem?mesa=${t.token}`} target="_blank" rel="noopener noreferrer" className="w-full rounded-lg border border-[#352b24] px-3 py-3 text-center text-sm">Abrir tablet nesta mesa</a>}
                <button onClick={() => patch(t.id, { active: !t.active })}
                  className="flex-1 text-xs border border-[#352b24] hover:bg-[#241d18] rounded-lg px-2 py-1.5">
                  {t.active ? "Desativar" : "Ativar"}
                </button>
                <button onClick={() => patch(t.id, { rotateToken: true })}
                  className="flex-1 text-xs border border-[#352b24] hover:bg-[#241d18] rounded-lg px-2 py-1.5">
                  ♻️ Novo QR
                </button>
                <button onClick={() => remove(t.id)}
                  className="text-xs border border-red-900/60 text-red-300 hover:bg-red-950/40 rounded-lg px-2 py-1.5">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
