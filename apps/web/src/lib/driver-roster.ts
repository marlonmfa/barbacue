import { db } from "@/db";
import { orders, staffUsers, staffPresence } from "@/db/schema";
import { and, asc, eq, count, inArray } from "drizzle-orm";
import { can } from "@/lib/permissions";
import { isStaffOnline } from "@/lib/staff-presence";
export async function driverRoster() {
    const [drivers, workload] = await Promise.all([
      db.select({ id: staffUsers.id, name: staffUsers.name, role: staffUsers.role, permissions: staffUsers.permissions, available: staffPresence.available, lastSeenAt: staffPresence.lastSeenAt })
        .from(staffUsers).leftJoin(staffPresence, eq(staffPresence.userId, staffUsers.id))
        .where(and(eq(staffUsers.active, true), eq(staffUsers.role, "driver"))).orderBy(asc(staffUsers.name)),
      db.select({ driverId: orders.deliveryDriverId, count: count() }).from(orders)
        .where(and(eq(orders.orderType, "delivery"), inArray(orders.deliveryStatus, ["assigned", "out_for_delivery"]), inArray(orders.status, ["pending", "confirmed", "preparing", "ready"]))).groupBy(orders.deliveryDriverId),
    ]);
    return { drivers: drivers.filter(driver => can(driver, "deliveries")).map(driver => ({
      id: driver.id, name: driver.name, online: isStaffOnline(driver.available !== null && driver.lastSeenAt ? { available: driver.available, lastSeenAt: driver.lastSeenAt } : null),
      activeDeliveries: workload.find(row => row.driverId === driver.id)?.count ?? 0,
    })) };
}
