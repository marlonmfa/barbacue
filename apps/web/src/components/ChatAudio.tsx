"use client";
import { useEffect, useRef, useState } from "react";

export function ChatAudio({ disabled, onText }: { disabled: boolean; onText: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function transcribe(file: File) {
    if (file.size > 20 * 1024 * 1024) { setError("O áudio deve ter até 20 MB."); return; }
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch("/api/transcribe", { method: "POST", body, signal: AbortSignal.timeout(60_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui transcrever o áudio.");
      if (alive.current) onText(data.text);
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : "Falha na transcrição.");
    } finally { if (alive.current) setBusy(false); }
  }

  async function toggle() {
    if (recorder.current?.state === "recording") { recorder.current.stop(); return; }
    setError(""); setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Este navegador não permite gravar. Use Anexar áudio.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const device = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = device;
      const chunks: Blob[] = [];
      device.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      device.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        media.getTracks().forEach((track) => track.stop());
        if (!alive.current) return;
        setRecording(false);
        const type = device.mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        void transcribe(new File(chunks, `pedido.${extension}`, { type }));
      };
      device.start(); setRecording(true);
      timer.current = setTimeout(() => { if (device.state === "recording") device.stop(); }, 120_000);
    } catch (error) {
      stream.current?.getTracks().forEach((track) => track.stop());
      setError(error instanceof Error && error.name !== "NotAllowedError" ? error.message : "Permita o microfone ou anexe um áudio.");
    } finally { if (alive.current) setBusy(false); }
  }

  return <div className="px-3 py-2 text-sm border-t border-[var(--border)]">
    <div className="flex flex-wrap gap-3 items-center">
      <button type="button" className="underline py-2" disabled={disabled || busy} onClick={toggle}>{recording ? "Parar e transcrever" : "Gravar áudio"}</button>
      <button type="button" className="underline py-2" disabled={disabled || busy || recording} onClick={() => upload.current?.click()}>Anexar áudio</button>
      <input ref={upload} type="file" hidden accept="audio/*,.m4a,.webm,.ogg" onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) void transcribe(file);
      }} />
      <span role="status">{busy ? "Transcrevendo…" : recording ? "Gravando · até 2 minutos" : "Revise o texto antes de enviar."}</span>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
