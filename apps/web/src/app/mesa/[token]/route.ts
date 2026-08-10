import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { restaurantTables } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setTableSession } from "@/lib/table-session";

export const dynamic = "force-dynamic";

// The target of a printed table QR code: barbacue.../mesa/<token>. Scanning it
// "seats" the guest — we resolve the active table, drop a short-lived table-session
// cookie, and send them to the menu in dine-in mode. No login, no typing.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const home = new URL("/", req.url);

  // Basic shape check before hitting the DB (tokens are UUIDs).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (!isUuid) {
    home.searchParams.set("mesa", "notfound");
    return NextResponse.redirect(home);
  }

  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.token, token));

  if (!table || !table.active) {
    home.searchParams.set("mesa", "notfound");
    return NextResponse.redirect(home);
  }

  home.searchParams.set("mesa", "ok");
  const res = NextResponse.redirect(home);
  setTableSession(res, { number: table.number, token: table.token, label: table.label });
  return res;
}
