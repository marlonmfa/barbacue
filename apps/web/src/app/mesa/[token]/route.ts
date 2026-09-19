import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { restaurantTables } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clearTableSession, setTableSession } from "@/lib/table-session";

export const dynamic = "force-dynamic";

// The target of a printed table QR code: barbacue.../mesa/<token>. Scanning it
// "seats" the guest — we resolve the active table, drop a short-lived table-session
// cookie, and send them to the menu in dine-in mode. No login, no typing.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const menu = new URL("/pedir", req.url);
  const invalidTable = () => {
    menu.searchParams.set("mesa", "notfound");
    const res = NextResponse.redirect(menu);
    clearTableSession(res);
    return res;
  };

  // Basic shape check before hitting the DB (tokens are UUIDs).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (!isUuid) {
    return invalidTable();
  }

  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.token, token));

  if (!table || !table.active) {
    return invalidTable();
  }

  menu.searchParams.set("mesa", table.token);
  const res = NextResponse.redirect(menu);
  setTableSession(res, { number: table.number, token: table.token, label: table.label });
  return res;
}
