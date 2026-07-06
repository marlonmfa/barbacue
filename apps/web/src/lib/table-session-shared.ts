// Client-safe pieces of the table session — NO next/headers import, so client
// components (TableBanner, ChatAgent) can use the cookie name + type without
// pulling server-only APIs into the browser bundle. The server-only helpers
// (cookies(), NextResponse) live in table-session.ts.

export type TableSession = {
  number: number;
  token: string;
  label?: string | null;
};

export const TABLE_COOKIE = "barbacue_table";
