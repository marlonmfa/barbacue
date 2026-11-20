import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { barbaContactProfiles, staffUsers } from "@/db/schema";
import { barbaOrderPhoneKeys } from "@/lib/barba-contact";

export async function findBarbaContactRole(phone: string) {
  const keys = barbaOrderPhoneKeys(phone);
  const [[manual], staff] = await Promise.all([
    db.select({ role: barbaContactProfiles.role }).from(barbaContactProfiles)
      .where(inArray(barbaContactProfiles.phone, keys))
      .orderBy(sql`${barbaContactProfiles.phone} = ${phone} desc`).limit(1),
    db.select({ id: staffUsers.id, name: staffUsers.name, role: staffUsers.role }).from(staffUsers)
      .where(and(eq(staffUsers.active, true), inArray(staffUsers.whatsappPhone, keys),
        inArray(staffUsers.role, ["admin", "manager", "driver"])))
      .orderBy(sql`${staffUsers.whatsappPhone} = ${phone} desc`).limit(2),
  ]);
  // Legacy and current forms must never select a staff identity when they
  // resolve to different accounts.
  const member = staff.length === 1 ? staff[0] : null;
  const role = member?.role === "admin" || member?.role === "manager" || member?.role === "driver"
    ? member.role : null;
  return { manualRole: manual?.role ?? null, staff: member, staffRole: role };
}
