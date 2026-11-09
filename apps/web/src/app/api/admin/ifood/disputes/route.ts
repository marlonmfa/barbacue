import { NextResponse } from "next/server";
import { and, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ifoodOrderEvents } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { ifoodSettings } from "@/lib/ifood-api";
import { buildDisputes, deliveryCodeTimeline } from "@/lib/ifood-disputes";

// Disputas (negociação) e código de entrega dos últimos 7 dias, a partir dos eventos gravados pelo monitor.
export const GET = withStaff(async () => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await db.select().from(ifoodOrderEvents)
    .where(and(inArray(ifoodOrderEvents.code, ["HSD", "HSS", "LOCAL_DISPUTE", "DDCR", "DDCS", "DDCF"]), gte(ifoodOrderEvents.createdAt, since)));
  const stores = ifoodSettings().stores;
  return NextResponse.json({
    dryRun: ifoodSettings().dryRun,
    stores: stores.map(s => ({ id: s.id, name: s.name, brand: s.brand })),
    disputes: buildDisputes(rows),
    deliveryCodes: deliveryCodeTimeline(rows),
  }, { headers: { "Cache-Control": "no-store" } });
});
