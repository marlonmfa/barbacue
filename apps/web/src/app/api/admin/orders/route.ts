import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, restaurantTables, staffUsers, storeSettings } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";
import { can } from "@/lib/permissions";
import { addressNavigationLinks } from "@/lib/delivery-navigation";

export const GET = withStaff(async req => {
  if (req.nextUrl.searchParams.get("drivers") === "1") {
    const drivers = await db.select({ id: staffUsers.id, name: staffUsers.name, role: staffUsers.role, permissions: staffUsers.permissions })
      .from(staffUsers).where(and(eq(staffUsers.active, true), eq(staffUsers.role, "driver"))).orderBy(asc(staffUsers.name));
    return NextResponse.json({ drivers: drivers.filter(driver => can(driver, "deliveries")).map(({ id, name }) => ({ id, name })) }, { headers: { "Cache-Control": "no-store" } });
  }
  const rows = await db
    .select({
      id: orders.id,
      brand: orders.brand,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      deliveryAddress: orders.deliveryAddress,
      deliveryFeeCents: orders.deliveryFeeCents,
      deliveryDistanceMeters: orders.deliveryDistanceMeters,
      deliveryDurationSeconds: orders.deliveryDurationSeconds,
      deliveryRoute: orders.deliveryRoute,
      deliveryDriverId: orders.deliveryDriverId,
      deliveryDriverName: staffUsers.name,
      deliveryStatus: orders.deliveryStatus,
      dispatchedAt: orders.dispatchedAt,
      deliveredAt: orders.deliveredAt,
      items: orders.items,
      subtotalCents: orders.subtotalCents,
      discountCents: orders.discountCents,
      totalCents: orders.totalCents,
      couponCode: orders.couponCode,
      channel: orders.channel,
      orderType: orders.orderType,
      tableNumber: restaurantTables.number,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      status: orders.status,
      notes: orders.notes,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(restaurantTables, eq(orders.tableId, restaurantTables.id))
    .leftJoin(staffUsers, eq(orders.deliveryDriverId, staffUsers.id))
    .orderBy(desc(orders.createdAt));

  const [settings] = await db.select({ address: storeSettings.address }).from(storeSettings).where(eq(storeSettings.id, 1));
  return NextResponse.json(rows.map(row => ({ ...row, navigationLinks: row.orderType === "delivery" ? row.deliveryRoute ?? addressNavigationLinks(row.deliveryAddress, settings?.address ?? null) : null })), { headers: { "Cache-Control": "no-store" } });
});
