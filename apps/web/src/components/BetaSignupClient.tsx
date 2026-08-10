"use client";

import { useState } from "react";
import Link from "next/link";
import type { BetaPlatform } from "@/db/schema";

const inputClass =
  "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--brand-red)] transition-colors";

export function BetaSignupClient() {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState<BetaPlatform | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!platform) {
      setError("Escolha iPhone ou Android");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/beta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, whatsapp, email, platform }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível enviar, tente novamente");
        return;
      }
      setDone(true);
    } catch {
      setError("Falha de conexão — tente novamente");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 ember-bg">
        <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 text-center fire-glow animate-[fade-in-up_0.4s_ease]">
          <div className="text-5xl mb-4" aria-hidden>
            🎉
          </div>
          <h1 className="font-display text-2xl uppercase mb-2">
            Você está na lista!
          </h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-6">
            Cadastro recebido. Vamos te chamar no WhatsApp assim que a próxima
            leva de convites do beta abrir — fique de olho.
          </p>
          <Link
            href="/"
            className="inline-block btn-brand px-6 py-2.5 rounded-full font-semibold text-sm"
          >
            Ver o cardápio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 ember-bg">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--brand-red)] mb-2">
            Programa Beta
          </p>
          <h1 className="font-display text-3xl sm:text-4xl uppercase leading-tight">
            Teste o app do Barbacue
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-3 leading-relaxed">
            Peça pelo aplicativo antes de todo mundo e ajude a gente a deixar
            tudo no ponto. Vagas limitadas.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 flex flex-col gap-4 fire-glow"
        >
          <div>
            <label htmlFor="beta-name" className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
              Nome
            </label>
            <input
              id="beta-name"
              type="text"
              required
              autoComplete="name"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="beta-whatsapp" className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
              WhatsApp
            </label>
            <input
              id="beta-whatsapp"
              type="tel"
              required
              autoComplete="tel-national"
              placeholder="(11) 98888-7777"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="beta-email" className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
              E-mail
            </label>
            <input
              id="beta-email"
              type="email"
              required
              autoComplete="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <fieldset>
            <legend className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
              Seu celular
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: "ios", label: "iPhone", icon: "🍎" },
                  { value: "android", label: "Android", icon: "🤖" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-semibold cursor-pointer transition-all active:scale-95 ${
                    platform === opt.value
                      ? "border-[var(--brand-red)] bg-[var(--brand-red)]/10 text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="platform"
                    value={opt.value}
                    checked={platform === opt.value}
                    onChange={() => setPlatform(opt.value)}
                    className="sr-only"
                  />
                  <span aria-hidden>{opt.icon}</span>
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-[var(--brand-red)] bg-[var(--brand-red)]/10 border border-[var(--brand-red)]/30 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-brand w-full py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Enviando..." : "Quero testar o app"}
          </button>

          <p className="text-[11px] text-[var(--text-muted)] text-center leading-relaxed">
            Usamos seus dados só para o programa beta. Nada de spam.
          </p>
        </form>
      </div>
    </main>
  );
}
