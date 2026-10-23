import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { allowedIfoodActions, ifoodExternalId, ifoodStoreFromNotes } from "@/lib/ifood";
import { ifoodSettings, storeOverview } from "@/lib/ifood-api";

// Visão única das três lojas: situação no iFood e pedidos importados pelo monitor.
export const GET = withStaff(async () => {
  const settings = ifoodSettings();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.select({
    id: orders.id, brand: orders.brand, customerName: orders.customerName, customerPhone: orders.customerPhone,
    orderType: orders.orderType, deliveryAddress: orders.deliveryAddress, items: orders.items,
    subtotalCents: orders.subtotalCents, discountCents: orders.discountCents, deliveryFeeCents: orders.deliveryFeeCents, totalCents: orders.totalCents,
    paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus, status: orders.status, notes: orders.notes, createdAt: orders.createdAt,
  }).from(orders)
    .where(and(eq(orders.channel, "ifood"), or(gte(orders.createdAt, since), inArray(orders.status, ["pending", "confirmed", "preparing", "ready"]))))
    .orderBy(desc(orders.createdAt)).limit(300);

  const stores = settings.configured
    ? await Promise.all(settings.stores.map(storeOverview))
    : settings.stores.map(store => ({ ...store, status: null, interruptions: null, forbidden: false, error: "Credenciais do iFood não configuradas no servidor." }));

  return NextResponse.json({
    configured: settings.configured,
    dryRun: settings.dryRun,
    stores,
    orders: rows.map(row => {
      const externalId = ifoodExternalId(row.id, row.notes);
      const store = ifoodStoreFromNotes(row.notes, settings.stores) ?? settings.stores.find(s => s.brand === row.brand) ?? null;
      return {
        ...row,
        externalId,
        displayId: row.notes?.match(/^iFood #(.+)$/m)?.[1] ?? null,
        storeId: store?.id ?? null,
        actions: externalId ? allowedIfoodActions(row.status, row.orderType) : [],
      };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
});
