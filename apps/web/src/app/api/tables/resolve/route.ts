import { NextRequest } from "next/server";
import { db } from "@/db";
import { restaurantTables } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// JSON twin of /mesa/<token>, for clients that cannot be seated by a redirect +
// Set-Cookie — the native app resolves the QR's token over HTTP and holds the
// session in its own store. Public on purpose: the token already IS the bearer
// credential (/api/orders accepts it unauthenticated), and the answer carries
// nothing the printed QR doesn't already grant.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";

  const notFound = () =>
    Response.json(
      {
        error: "notfound",
        message:
          "QR Code inválido ou mesa desativada. Chame um atendente ou peça para entrega.",
      },
      { status: 404 },
    );

  // Basic shape check before hitting the DB (tokens are UUIDs).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (!isUuid) return notFound();

  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.token, token));

  if (!table || !table.active) return notFound();

  // Only what a seated guest's UI needs. The row's `id` never leaves the server
  // — even the web cookie omits it — so nothing can address a table by id.
  return Response.json({ number: table.number, token: table.token, label: table.label });
}
