import { NextRequest } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Returns recent orders for a phone number, so the WhatsApp bot (and any logged
// client) can offer "repeat my last order". This exposes customer order history,
// so it is gated by the shared bot token rather than being fully public.
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-bot-token");
  const expected = process.env.BOT_API_TOKEN;
  if (!expected || token !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const phone = req.nextUrl.searchParams.get("phone")?.trim();
  if (!phone) return Response.json({ error: "phone is required" }, { status: 400 });

  const rows = await db
    .select({
      id: orders.id,
      items: orders.items,
      totalCents: orders.totalCents,
      customerName: orders.customerName,
      deliveryAddress: orders.deliveryAddress,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.customerPhone, phone))
    .orderBy(desc(orders.createdAt))
    .limit(5);

  return Response.json({ phone, orders: rows });
}
