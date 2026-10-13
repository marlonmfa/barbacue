import { headers } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { brandFromHost } from "@/lib/brand-storefront";
export const dynamic = "force-dynamic";
export async function GET() {
  const h = await headers();
  const brand = brandFromHost(h.get("x-forwarded-host") ?? h.get("host")) ?? "barbacue";
  const bytes = await readFile(path.join(process.cwd(), "public", "brand", "icons", `${brand}-apple.png`));
  return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600", "Vary": "Host, X-Forwarded-Host" } });
}
