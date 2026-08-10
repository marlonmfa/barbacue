import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { eq } from "drizzle-orm";

// Node runtime: reads bytea Buffers from node-postgres.
export const runtime = "nodejs";

// A media asset is immutable — a new upload mints a new uuid — so its bytes can be
// cached forever by the browser and any CDN in front of us. The uuid doubles as a
// strong ETag, letting revisits short-circuit with 304 Not Modified.
const IMMUTABLE = "public, max-age=31536000, immutable";

type Params = { params: Promise<{ id: string }> };

// Basic uuid guard so malformed ids fail fast without touching the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const etag = `"${id}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": IMMUTABLE, "X-Content-Type-Options": "nosniff" },
    });
  }

  const [asset] = await db
    .select({ mime: mediaAssets.mime, data: mediaAssets.data })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);

  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Uint8Array keeps the Web Response body typing happy across runtimes.
  const bytes = new Uint8Array(asset.data);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": IMMUTABLE,
      ETag: etag,
      // Belt-and-suspenders: the stored MIME is already magic-byte-verified, but
      // this stops any browser from sniffing the bytes into a different type.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
