"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Range { open: string; close: string }
interface DayHours { day: number; closed: boolean; ranges: Range[] }
interface ClosedDay { id: number; date: string; reason: string | null }

interface Settings {
  storeName: string; tagline: string | null; phone: string | null;
  whatsapp: string | null; address: string | null; instagramUrl: string | null;
  logoUrl: string | null; openingHours: string | null;
  weeklyHours: DayHours[] | null; timezone: string | null;
  deliveryFeeText: string | null; isOpen: boolean;
  pixKey: string | null; pixMerchantName: string | null; pixMerchantCity: string | null;
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function defaultWeekly(): DayHours[] {
  // Sensible starting point: closed Mondays, open 18:00–23:00 the rest.
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    closed: day === 1,
    ranges: day === 1 ? [] : [{ open: "18:00", close: "23:00" }],
  }));
}

const EMPTY: Settings = {
  storeName: "Barbacue", tagline: "Peça agora — entregamos com amor!",
  phone: null, whatsapp: null, address: null, instagramUrl: null,
  logoUrl: null, openingHours: null, weeklyHours: null,
  timezone: "America/Sao_Paulo", deliveryFeeText: null, isOpen: true,
  pixKey: null, pixMerchantName: null, pixMerchantCity: null,
};

export default function AdminSettings() {
  const [form, setForm] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Managers receive a redacted settings object (no pix*, a `pixConfigured` flag).
  // Only admins can edit the payment config.
  const [canEditPix, setCanEditPix] = useState(false);
  const [pixConfigured, setPixConfigured] = useState(false);

  // Closed-days are stored in their own table, managed independently.
  const [closedDays, setClosedDays] = useState<ClosedDay[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d) {
          setForm({ ...EMPTY, ...d, weeklyHours: d.weeklyHours ?? null });
          // 'pixConfigured' present ⇒ manager (redacted). Absent ⇒ admin.
          const isManager = "pixConfigured" in d;
          setCanEditPix(!isManager);
          setPixConfigured(isManager ? Boolean(d.pixConfigured) : Boolean(d.pixKey));
        }
        setLoading(false);
      });
    fetch("/api/admin/closed-days").then((r) => r.json()).then(setClosedDays);
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  const weekly = form.weeklyHours ?? defaultWeekly();

  function updateDay(day: number, patch: Partial<DayHours>) {
    const next = weekly.map((d) => (d.day === day ? { ...d, ...patch } : d));
    set("weeklyHours", next);
  }
  function updateRange(day: number, idx: number, patch: Partial<Range>) {
    const d = weekly.find((x) => x.day === day)!;
    const ranges = d.ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updateDay(day, { ranges });
  }
  function addRange(day: number) {
    const d = weekly.find((x) => x.day === day)!;
    updateDay(day, { closed: false, ranges: [...d.ranges, { open: "18:00", close: "23:00" }] });
  }
  function removeRange(day: number, idx: number) {
    const d = weekly.find((x) => x.day === day)!;
    updateDay(day, { ranges: d.ranges.filter((_, i) => i !== idx) });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, weeklyHours: weekly }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSaveError(d.message ?? "Não foi possível salvar. Verifique suas permissões.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Sem conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function addClosedDay() {
    if (!newDate) return;
    const res = await fetch("/api/admin/closed-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDate, reason: newReason || null }),
    });
    if (res.ok) {
      setNewDate("");
      setNewReason("");
      fetch("/api/admin/closed-days").then((r) => r.json()).then(setClosedDays);
    }
  }
  async function removeClosedDay(id: number) {
    await fetch(`/api/admin/closed-days/${id}`, { method: "DELETE" });
    setClosedDays((d) => d.filter((x) => x.id !== id));
  }

  if (loading) return <p className="text-neutral-400 text-sm">Carregando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-4">Configurações da loja</h1>
      <p className="text-sm text-neutral-400 mb-6">Para definir a origem, a área atendida e o valor por distância, acesse <Link href="/admin/delivery-settings" className="text-amber-200 underline underline-offset-4">Entrega e frete</Link>.</p>

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
          <F label="Resumo do horário (texto exibido ao cliente)">
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
              {form.isOpen ? "Aberta (segue a agenda abaixo)" : "Fechada manualmente (sobrepõe a agenda)"}
            </span>
          </label>
        </Section>

        <Section title="Horário de funcionamento (agenda)">
          <F label="Fuso horário">
            <input className={ic} placeholder="America/Sao_Paulo"
              value={form.timezone ?? ""}
              onChange={(e) => set("timezone", e.target.value || null)} />
          </F>
          <div className="flex flex-col gap-2">
            {weekly.map((d) => (
              <div key={d.day} className="flex flex-col gap-2 border border-neutral-700 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white w-24">{DAY_NAMES[d.day]}</span>
                  <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                    <input type="checkbox" checked={d.closed}
                      onChange={(e) => updateDay(d.day, { closed: e.target.checked, ranges: e.target.checked ? [] : (d.ranges.length ? d.ranges : [{ open: "18:00", close: "23:00" }]) })} />
                    Fechado
                  </label>
                </div>
                {!d.closed && (
                  <div className="flex flex-col gap-2">
                    {d.ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="time" className={icSm} value={r.open}
                          onChange={(e) => updateRange(d.day, i, { open: e.target.value })} />
                        <span className="text-neutral-500 text-xs">às</span>
                        <input type="time" className={icSm} value={r.close}
                          onChange={(e) => updateRange(d.day, i, { close: e.target.value })} />
                        <button type="button" onClick={() => removeRange(d.day, i)}
                          className="text-red-400 text-xs px-2 py-1 rounded-lg bg-red-900/20 hover:bg-red-900/40">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addRange(d.day)}
                      className="self-start text-xs text-amber-300 hover:text-amber-200">+ adicionar faixa</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Pagamento Pix">
          {canEditPix ? (
            <>
              <p className="text-xs text-neutral-400 -mt-1">
                Usado para gerar o QR Code / copia-e-cola no checkout. A chave pode ser
                CPF/CNPJ, e-mail, telefone ou chave aleatória.
              </p>
              <F label="Chave Pix">
                <input className={ic} placeholder="email@exemplo.com / CPF / chave"
                  value={form.pixKey ?? ""}
                  onChange={(e) => set("pixKey", e.target.value || null)} />
              </F>
              <F label="Nome do recebedor (máx. 25)">
                <input className={ic} maxLength={25} placeholder="LANCHES DO BARBA"
                  value={form.pixMerchantName ?? ""}
                  onChange={(e) => set("pixMerchantName", e.target.value || null)} />
              </F>
              <F label="Cidade do recebedor (máx. 15, sem acento)">
                <input className={ic} maxLength={15} placeholder="JARAGUA DO SUL"
                  value={form.pixMerchantCity ?? ""}
                  onChange={(e) => set("pixMerchantCity", e.target.value || null)} />
              </F>
            </>
          ) : (
            <p className="text-sm text-neutral-400">
              {pixConfigured ? "✓ Pix configurado." : "Pix ainda não configurado."} Apenas o
              administrador do sistema pode editar a chave Pix.
            </p>
          )}
        </Section>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving}
            className="bg-[#ed1b24] hover:bg-[#c8141c] disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
          {saved && <span className="text-green-400 text-sm">✓ Salvo com sucesso!</span>}
          {saveError && <span className="text-red-400 text-sm">{saveError}</span>}
        </div>
      </form>

      {/* Closed days are saved immediately, independent of the form above. */}
      <div className="max-w-2xl mt-6">
        <Section title="Dias fechados (feriados / folgas)">
          <div className="flex flex-wrap items-end gap-3">
            <F label="Data">
              <input type="date" className={ic} value={newDate}
                onChange={(e) => setNewDate(e.target.value)} />
            </F>
            <F label="Motivo (opcional)">
              <input className={ic} placeholder="Feriado, viagem..."
                value={newReason} onChange={(e) => setNewReason(e.target.value)} />
            </F>
            <button type="button" onClick={addClosedDay}
              className="bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl">
              Adicionar
            </button>
          </div>
          <div className="flex flex-col gap-1.5 mt-2">
            {closedDays.length === 0 && <p className="text-neutral-500 text-sm">Nenhum dia fechado cadastrado.</p>}
            {closedDays.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-neutral-900 rounded-lg px-3 py-2">
                <span className="text-sm text-neutral-200">
                  {c.date}{c.reason ? ` — ${c.reason}` : ""}
                </span>
                <button onClick={() => removeClosedDay(c.id)}
                  className="text-red-400 text-xs px-2 py-1 rounded-lg bg-red-900/20 hover:bg-red-900/40">Remover</button>
              </div>
            ))}
          </div>
        </Section>
      </div>
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
const icSm = "bg-neutral-700 border border-neutral-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";
