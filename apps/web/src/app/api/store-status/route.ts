import { db } from "@/db";
import { storeSettings, closedDays } from "@/db/schema";
import { eq, gte, asc } from "drizzle-orm";
import { computeStoreStatus } from "@/lib/store-hours";

export const dynamic = "force-dynamic";

// Public: web banner, mobile app, and the WhatsApp bot all read this to decide
// whether ordering is allowed right now.
export async function GET() {
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = await db
    .select({ date: closedDays.date, reason: closedDays.reason })
    .from(closedDays)
    .where(gte(closedDays.date, todayStr))
    .orderBy(asc(closedDays.date));

  const status = computeStoreStatus(settings, upcoming);

  return Response.json({
    open: status.open,
    reason: status.reason,
    nextOpen: status.nextOpen,
    openingHours: settings?.openingHours ?? null,
    weeklyHours: settings?.weeklyHours ?? null,
    timezone: settings?.timezone ?? "America/Sao_Paulo",
  });
}
