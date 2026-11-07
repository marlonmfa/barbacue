import { db } from "@/db";
import { anotaWebhookInbox } from "@/db/anota-schema";
import { anotaBrand, anotaWebhookSecret, isAnotaEvent, providerOrderId, secureTokenEquals, webhookToken } from "@/lib/anota-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function receive(request: Request, context: { params: Promise<{ event: string }> }) {
  const brand = anotaBrand(request);
  if (!brand) return Response.json({ error: "unknown_brand" }, { status: 404 });
  const secret = anotaWebhookSecret(brand);
  if (!secret || secret.length < 32) return Response.json({ error: "not_configured" }, { status: 503 });

  const { event } = await context.params;
  if (!isAnotaEvent(event)) return Response.json({ error: "unknown_event" }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 1_048_576) return Response.json({ error: "too_large" }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!secureTokenEquals(webhookToken(request, body), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const orderId = providerOrderId(body);
  if (!orderId) return Response.json({ error: "missing_order_id" }, { status: 422 });
  await db.insert(anotaWebhookInbox).values({ brand, event, providerOrderId: orderId, payload: body })
    .onConflictDoNothing({ target: [anotaWebhookInbox.brand, anotaWebhookInbox.event, anotaWebhookInbox.providerOrderId] });
  return Response.json({ received: true });
}

export const POST = receive;
export const PUT = receive;
