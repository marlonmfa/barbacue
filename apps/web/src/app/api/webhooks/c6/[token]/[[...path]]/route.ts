import { eq } from "drizzle-orm";
import { db } from "@/db";
import { onlineCheckouts } from "@/db/schema";
import { checkoutIdFromTxid } from "@/lib/c6-pix";
import { ensureOnlinePayment, isC6Environment } from "@/lib/online-checkout";
import { secureEquals } from "@/lib/online-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Pix do C6 (padrão BACEN). O banco chama a URL cadastrada acrescida
 * de "/pix", com `{ "pix": [{ txid, endToEndId, valor, ... }] }`.
 * O segredo vai no caminho; o corpo é só um aviso: cada txid é conferido
 * consultando a cobrança no C6 antes de liberar qualquer pedido.
 */
export async function POST(request: Request, context: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token } = await context.params;
  const secret = process.env.C6_WEBHOOK_TOKEN ?? "";
  if (secret.length < 32 || !secureEquals(token, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 262_144) return Response.json({ error: "too_large" }, { status: 413 });
  let body: { pix?: { txid?: unknown }[] } | null = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  // Chamada de validação do cadastro (sem Pix) ou Pix sem txid (QR estático).
  const txids = [...new Set((Array.isArray(body?.pix) ? body.pix : []).map(p => p?.txid).filter((t): t is string => typeof t === "string" && /^[a-zA-Z0-9]{26,35}$/.test(t)))].slice(0, 50);
  let failed = 0;
  for (const txid of txids) {
    let [checkout] = await db.select().from(onlineCheckouts).where(eq(onlineCheckouts.paymentId, txid));
    if (!checkout) {
      const id = checkoutIdFromTxid(txid);
      if (id) [checkout] = await db.select().from(onlineCheckouts).where(eq(onlineCheckouts.id, id));
    }
    // Pix de outros sistemas na mesma conta: nada a fazer aqui.
    if (!checkout || !isC6Environment(checkout.environment)) continue;
    try { await ensureOnlinePayment(checkout.id); }
    catch (error) { failed++; console.error(`[c6-webhook] txid ${txid}: ${(error as Error).message}`); }
  }
  // 503 faz o banco reenviar; a consulta periódica também cobre a falha.
  return failed ? Response.json({ error: "verification_pending" }, { status: 503 }) : Response.json({ received: true });
}
