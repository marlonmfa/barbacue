"use client";

import { useEffect, useState } from "react";

interface Settings {
  storeName: string; tagline: string | null; phone: string | null;
  whatsapp: string | null; address: string | null; instagramUrl: string | null;
  logoUrl: string | null; openingHours: string | null;
  deliveryFeeText: string | null; isOpen: boolean;
}

const EMPTY: Settings = {
  storeName: "Barbacue", tagline: "Peça agora — entregamos com amor!",
  phone: null, whatsapp: null, address: null, instagramUrl: null,
  logoUrl: null, openingHours: null, deliveryFeeText: null, isOpen: true,
};

export default function AdminSettings() {
  const [form, setForm] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => { if (d) setForm(d); setLoading(false); });
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <p className="text-neutral-400 text-sm">Carregando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Configurações da loja</h1>

      <form onSubmit={handleSave} className="max-w-2xl flex flex-col gap-6">
        <Section title="Informações gerais">
          <F label="Nome da loja *">
            <input required className={ic} value={form.storeName}
              onChange={(e) => set("storeName", e.target.value)} />
          </F>
          <F label="Slogan">
            <input className={ic} value={form.tagline ?? ""}
              onChange={(e) => set("tagline", e.target.value || null)} />
          </F>
          <F label="URL do logo">
            <input type="url" className={ic} value={form.logoUrl ?? ""}
              onChange={(e) => set("logoUrl", e.target.value || null)} />
          </F>
        </Section>

        <Section title="Contato">
          <F label="Telefone">
            <input className={ic} value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value || null)} />
          </F>
          <F label="WhatsApp">
            <input className={ic} placeholder="5511999999999"
              value={form.whatsapp ?? ""}
              onChange={(e) => set("whatsapp", e.target.value || null)} />
          </F>
          <F label="Instagram (URL)">
            <input type="url" className={ic} value={form.instagramUrl ?? ""}
              onChange={(e) => set("instagramUrl", e.target.value || null)} />
          </F>
        </Section>

        <Section title="Operação">
          <F label="Endereço">
            <input className={ic} value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value || null)} />
          </F>
          <F label="Horário de funcionamento">
            <input className={ic} placeholder="Ter–Dom, 18h às 23h"
              value={form.openingHours ?? ""}
              onChange={(e) => set("openingHours", e.target.value || null)} />
          </F>
          <F label="Taxa de entrega (texto)">
            <input className={ic} placeholder="Grátis acima de R$60 • R$5 até 3km"
              value={form.deliveryFeeText ?? ""}
              onChange={(e) => set("deliveryFeeText", e.target.value || null)} />
          </F>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set("isOpen", !form.isOpen)}
              className={`relative w-12 h-6 rounded-full transition-colors ${form.isOpen ? "bg-green-500" : "bg-neutral-600"}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isOpen ? "translate-x-7" : "translate-x-1"}`} />
            </div>
            <span className="text-sm text-neutral-300">
              {form.isOpen ? "Loja aberta" : "Loja fechada"}
            </span>
          </label>
        </Section>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
          {saved && <span className="text-green-400 text-sm">✓ Salvo com sucesso!</span>}
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-800 rounded-2xl border border-neutral-700 p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

const ic = "bg-neutral-700 border border-neutral-600 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-full placeholder-neutral-500";
