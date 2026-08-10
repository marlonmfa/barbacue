import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TABLE_COOKIE, type TableSession } from "@/lib/table-session-shared";

// A "seated" guest: which restaurant table this browser is ordering from. Set by
// the /mesa/<token> QR route, read by the cart/payment pages + the AI agent so
// the whole ordering flow switches to dine-in mode. NOT httpOnly: the client UI
// shows "Mesa N", but the SERVER never trusts the number — /api/orders re-resolves
// the table from `token` against the DB, so a forged cookie can't fake a table.
// The cookie name + type live in table-session-shared.ts (client-safe).
export { TABLE_COOKIE, type TableSession };
const MAX_AGE = 60 * 60 * 3; // 3h — a dining session, then it lapses

function encode(data: TableSession): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function decode(raw: string | undefined): TableSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString()) as TableSession;
    if (typeof parsed.number !== "number" || typeof parsed.token !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setTableSession(res: NextResponse, data: TableSession): void {
  res.cookies.set(TABLE_COOKIE, encode(data), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearTableSession(res: NextResponse): void {
  res.cookies.set(TABLE_COOKIE, "", { maxAge: 0, path: "/" });
}

/** Read from a server component / server route. Returns null when not seated. */
export async function getTableSession(): Promise<TableSession | null> {
  const store = await cookies();
  return decode(store.get(TABLE_COOKIE)?.value);
}

/** Parse a raw cookie value (e.g. from a request) without next/headers. */
export function parseTableCookie(raw: string | undefined): TableSession | null {
  return decode(raw);
}
