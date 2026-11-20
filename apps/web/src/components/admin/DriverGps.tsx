"use client";

import { useEffect, useState } from "react";
import { dispatchGpsIntervalMs } from "@/lib/dispatch-gps";
import styles from "./OperationalQueue.module.css";

function sendGps(routeId: string, sessionId: string, action: string, position?: GeolocationPosition) {
  return fetch("/api/admin/delivery", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    keepalive: action === "stop",
    body: JSON.stringify({ gps: {
      action, routeId, sessionId,
      ...(position ? {
        point: { latitude: position.coords.latitude, longitude: position.coords.longitude },
        accuracy: position.coords.accuracy, capturedAt: Math.round(position.timestamp),
      } : {}),
    } }),
  });
}

export function DriverGps({ routeId }: { routeId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let running = false;
    function update() {
      if (cancelled || running) return;
      running = true;
      navigator.geolocation.getCurrentPosition(async position => {
        try {
          if (cancelled) return;
          if (position.coords.accuracy > 100) {
            setMessage("Aguardando um sinal mais preciso.");
            return;
          }
          const result = await sendGps(routeId, sessionId!, "position", position);
          if (cancelled) return;
          if (result.status === 409) {
            setSessionId(null);
            setMessage("O compartilhamento desta rota foi encerrado.");
          } else setMessage(result.ok ? "Posição compartilhada com o despacho." : "Aguardando atualização do trajeto.");
        } catch {
          if (!cancelled) setMessage("Conexão indisponível. O envio será retomado quando voltar.");
        } finally { running = false; }
      }, error => {
        running = false;
        if (cancelled) return;
        if (error.code === error.PERMISSION_DENIED) {
          setSessionId(null);
          setMessage("Permita a localização nas configurações do navegador e tente de novo.");
        } else setMessage("Aguardando sinal de GPS.");
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 });
    }
    function close() { void sendGps(routeId, sessionId!, "stop").catch(() => {}); }
    update();
    const timer = window.setInterval(update, dispatchGpsIntervalMs);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", close);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", close);
      close();
    };
  }, [routeId, sessionId]);

  async function start() {
    if (!navigator.geolocation || !window.isSecureContext || !["http:", "https:"].includes(location.protocol)) {
      setMessage("Abra Minhas entregas no navegador do celular para compartilhar sua posição.");
      return;
    }
    setStarting(true);
    setMessage("Solicitando acesso ao GPS…");
    try {
      const token = crypto.randomUUID();
      const response = await sendGps(routeId, token, "start");
      if (!response.ok) throw new Error();
      setSessionId(token);
    } catch { setMessage("Não foi possível iniciar o compartilhamento. Confira a rota e tente novamente."); }
    finally { setStarting(false); }
  }

  return <section className={styles.availability} aria-label="Localização da rota">
    <div><strong>Localização da rota</strong>
      <p>{message || "Compartilhe sua posição com o despacho enquanto estiver nesta rota."}</p>
    </div>
    <button className={styles.secondary} disabled={starting} onClick={() => {
      if (!sessionId) { void start(); return; }
      setSessionId(null);
      setMessage("Compartilhamento interrompido.");
    }}>{sessionId ? "Parar compartilhamento" : "Compartilhar localização"}</button>
  </section>;
}
