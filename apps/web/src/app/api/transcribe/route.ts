import OpenAI from "openai";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
const LIMIT = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const limit = rateLimit(`transcribe:${clientIp(request)}`, 10, 60_000);
  if (!limit.ok) return Response.json({ error: "Aguarde um pouco antes de enviar outro áudio." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!apiKey) return Response.json({ error: "Transcrição indisponível no momento. Envie seu pedido por texto." }, { status: 503 });
  if (Number(request.headers.get("content-length")) > LIMIT + 65536) return Response.json({ error: "Envie um áudio de até 20 MB." }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Arquivo inválido." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Envie um arquivo de áudio." }, { status: 400 });
  if (file.size > LIMIT) return Response.json({ error: "Envie um áudio de até 20 MB." }, { status: 413 });
  if (!/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$/i.test(file.name)) return Response.json({ error: "Formato não suportado. Use MP3, M4A, WAV, OGG ou WebM." }, { status: 415 });
  try {
    const openai = new OpenAI({ apiKey, timeout: 50_000, maxRetries: 0 });
    const result = await openai.audio.transcriptions.create({ model: "whisper-1", file, language: "pt" });
    if (!result.text.trim()) return Response.json({ error: "Não identifiquei fala. Tente gravar novamente." }, { status: 422 });
    return Response.json({ text: result.text }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não consegui transcrever este áudio. Tente novamente ou escreva seu pedido." }, { status: 502 });
  }
}
