import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { staffPresence, staffUsers } from "@/db/schema";
import { courierPayRules } from "@/lib/courier-pay";
import { can, type AccessRole } from "@/lib/permissions";
import { PRESENCE_TTL_MS } from "@/lib/staff-presence";

export const canSetCourierAvailability = (role: AccessRole) =>
  role === "admin" || role === "manager" || role === "cashier";

export const dispatchAvailablePresence = and(eq(staffPresence.available, true), or(
  sql`${staffPresence.declaredAvailableUntil} > clock_timestamp()`,
  sql`${staffPresence.lastSeenAt} > clock_timestamp() - ${PRESENCE_TTL_MS} * interval '1 millisecond'`,
));

export async function declareCourierAvailable(driverId: number) {
  return db.transaction(async tx => {
    const [courier] = await tx.select({ role: staffUsers.role, permissions: staffUsers.permissions })
      .from(staffUsers).where(and(eq(staffUsers.id, driverId), eq(staffUsers.role, "driver"), eq(staffUsers.active, true)))
      .for("share");
    if (!courier || !can(courier, "deliveries")) return null;
    const { timeZone, dayStartHour } = courierPayRules;
    const expires = sql`(
      ((clock_timestamp() at time zone ${timeZone}) - ${dayStartHour} * interval '1 hour')::date
      + 1 + make_time(${dayStartHour},0,0)
    ) at time zone ${timeZone}`;
    const values = { available: true, lastSeenAt: sql`clock_timestamp()`, declaredAvailableUntil: expires };
    const [saved] = await tx.insert(staffPresence).values({ userId: driverId, ...values })
      .onConflictDoUpdate({ target: staffPresence.userId, set: values })
      .returning({ until: staffPresence.declaredAvailableUntil });
    return saved.until;
  });
}
