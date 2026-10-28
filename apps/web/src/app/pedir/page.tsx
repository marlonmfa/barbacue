import type { Viewport } from "next";
import { headers } from "next/headers";
import { OnlineMenu } from "@/components/OnlineMenu";
import { brandFromHost } from "@/lib/brand-storefront";
import { getTableSession } from "@/lib/table-session";
export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#17120f", colorScheme: "dark" };
export default async function OrderPage({ searchParams }: { searchParams: Promise<{ mesa?: string | string[]; restaurante?: string }> }) {
  const [query, requestHeaders, session] = await Promise.all([searchParams, headers(), getTableSession()]);
  const requestedBrand = ["barbacue", "barbadog", "chelas"].includes(query.restaurante ?? "") ? query.restaurante as "barbacue" | "barbadog" | "chelas" : null;
  const brand = requestedBrand ?? brandFromHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")) ?? "barbacue";
  const tableToken = query.mesa === undefined ? session?.token : typeof query.mesa === "string" ? query.mesa : "invalid";
  return <OnlineMenu key={`${brand}:${tableToken ?? "direct"}`} initialBrand={brand} tableToken={tableToken} />;
}
