import { eq } from "drizzle-orm";
import { db } from "@/db";
import { onlineCheckouts } from "@/db/schema";
import { getAsaasPayment } from "@/lib/asaas";
import { applyVerifiedPayment } from "@/lib/online-checkout";
import { secureEquals } from "@/lib/online-payment";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!secret || secret.length < 32 || !secureEquals(request.headers.get("asaas-access-token") ?? "", secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 65_536) return Response.json({ error: "too_large" }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const paymentId = body?.payment?.id;
  if (typeof body?.event !== "string" || !body.event.startsWith("PAYMENT_") || typeof paymentId !== "string") return Response.json({ received: true });
  let [checkout] = await db.select().from(onlineCheckouts).where(eq(onlineCheckouts.paymentId, paymentId));
  if (!checkout && typeof body.payment.externalReference === "string" && /^barbacue:order:[a-f0-9-]{36}$/.test(body.payment.externalReference)) {
    [checkout] = await db.select().from(onlineCheckouts).where(eq(onlineCheckouts.orderId, body.payment.externalReference.slice("barbacue:order:".length)));
    // A creation callback can arrive before the financial POST returns. The
    // customer and committed attempt marker must already bind this order.
    if (!checkout?.customerId || !checkout.paymentAttemptedAt) return Response.json({ received: true });
  }
  // Shared Asaas account: unrelated E26 payments have no effect on this system.
  // A webhook racing the initial POST is recovered by externalReference on retry.
  if (!checkout) return Response.json({ received: true });
  try {
    await applyVerifiedPayment(checkout.id, await getAsaasPayment(paymentId));
    return Response.json({ received: true });
  } catch { return Response.json({ error: "verification_pending" }, { status: 503 }); }
}
