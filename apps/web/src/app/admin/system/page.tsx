"use client";

import { useEffect, useState } from "react";

interface SystemHealth {
  openai: { configured: boolean; model: string };
  whatsappBot: { configured: boolean };
  sessionSecret: { configured: boolean };
  masterPassword: { configured: boolean };
  pix: { configured: boolean };
  publicSiteUrl: string | null;
  nodeEnv: string;
}

function Status({ ok }: { ok: boolean }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ok ? "bg-green-900/50 text-green-300" : "bg-red-950/60 text-red-300"}`}>
      {ok ? "✓ Configurado" : "✗ Ausente"}
    </span>
  );
}

export default function AdminSystem() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/system")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setHealth)
      .catch(() => setErr("Sem permissão (apenas administradores) ou erro ao carregar."));
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Sistema</h1>
      <p className="text-[#a89a8c] text-sm mb-6">
        Status das integrações e chaves. Por segurança, os valores secretos nunca são exibidos nem
        editáveis aqui — eles ficam no <code className="text-[#c8b89a]">.env</code> do servidor.
      </p>

      {err && <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-4 py-2.5">{err}</p>}

      {health && (
        <div className="flex flex-col gap-3">
          {[
            { label: "IA do atendente (OpenAI)", ok: health.openai.configured, extra: `Modelo: ${health.openai.model}` },
            { label: "Bot do WhatsApp (token)", ok: health.whatsappBot.configured },
            { label: "Segredo da sessão (cookie HMAC)", ok: health.sessionSecret.configured },
            { label: "Senha mestra / admin", ok: health.masterPassword.configured },
            { label: "Pagamento Pix", ok: health.pix.configured, extra: "Configure a chave em Configurações" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between bg-[#1a1512] border border-[#352b24] rounded-xl px-4 py-3">
              <div>
                <p className="font-medium text-[#f6efe8]">{row.label}</p>
                {row.extra && <p className="text-xs text-[#a89a8c]">{row.extra}</p>}
              </div>
              <Status ok={row.ok} />
            </div>
          ))}

          <div className="bg-[#1a1512] border border-[#352b24] rounded-xl px-4 py-3 text-sm text-[#a89a8c] mt-2">
            <p>Ambiente: <span className="text-[#f6efe8] font-mono">{health.nodeEnv}</span></p>
            {health.publicSiteUrl && (
              <p className="mt-1">Site público: <span className="text-[#f6efe8] font-mono break-all">{health.publicSiteUrl}</span></p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
