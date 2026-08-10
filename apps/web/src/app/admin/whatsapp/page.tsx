"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";

interface BotStatus {
  status?: "disconnected" | "connecting" | "qr_ready" | "connected";
  qrDataUrl?: string | null;
  phoneNumber?: string | null;
  error?: string;
}

const LABEL: Record<string, { text: string; cls: string }> = {
  connected: { text: "Conectado", cls: "bg-green-500/20 text-green-300" },
  qr_ready: { text: "Aguardando pareamento", cls: "bg-[#ed1b24]/20 text-[#c8b89a]" },
  connecting: { text: "Conectando...", cls: "bg-sky-500/20 text-sky-300" },
  disconnected: { text: "Desconectado", cls: "bg-red-500/20 text-red-300" },
};

export default function AdminWhatsApp() {
  const [data, setData] = useState<BotStatus | null>(null);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/whatsapp", { cache: "no-store" });
    if (res.status === 403) { setDenied(true); return; }
    setData(await res.json().catch(() => ({ error: "Resposta inválida" })));
  }, []);

  useEffect(() => {
    refresh();
    // Poll while pairing so the QR / status stays fresh.
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  if (denied) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-3">WhatsApp</h1>
        <p className="text-[#a89a8c] text-sm">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const status = data?.status ?? "disconnected";
  const badge = LABEL[status] ?? LABEL.disconnected;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">WhatsApp</h1>
      <p className="text-[#a89a8c] text-sm mb-6">Atendimento automático por IA via WhatsApp (Baileys).</p>

      <div className="max-w-md bg-[#1a1512] rounded-2xl border border-[#352b24] p-6 flex flex-col items-center gap-4">
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.cls}`}>{badge.text}</span>

        {status === "connected" && (
          <p className="text-[#a89a8c] text-sm text-center">
            Conectado{data?.phoneNumber ? ` como ${data.phoneNumber}` : ""}. O bot está atendendo. 🎉
          </p>
        )}

        {status === "qr_ready" && data?.qrDataUrl && (
          <>
            <p className="text-[#a89a8c] text-sm text-center">
              Abra o WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie:
            </p>
            <div className="bg-white p-3 rounded-xl">
              <Image src={data.qrDataUrl} alt="QR de pareamento" width={260} height={260} unoptimized />
            </div>
          </>
        )}

        {(status === "connecting" || (status === "qr_ready" && !data?.qrDataUrl)) && (
          <p className="text-[#a89a8c] text-sm">Aguarde o QR aparecer...</p>
        )}

        {status === "disconnected" && (
          <p className="text-[#a89a8c] text-sm text-center">
            {data?.error ?? "Bot offline. Verifique se o serviço whatsapp-bot está em execução."}
          </p>
        )}

        <button onClick={refresh}
          className="text-xs text-[#a89a8c] hover:text-white px-3 py-1.5 rounded-lg bg-[#241d18] hover:bg-[#352b24]">
          Atualizar
        </button>
      </div>
    </div>
  );
}
