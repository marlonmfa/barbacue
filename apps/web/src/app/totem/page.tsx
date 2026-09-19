import { headers } from "next/headers";
import { SelfServiceMenu } from "@/components/SelfServiceMenu";
import { brandFromHost } from "@/lib/brand-storefront";

export const dynamic = "force-dynamic";

export default async function KioskPage({
  searchParams,
}: {
  searchParams: Promise<{ mesa?: string | string[] }>;
}) {
  const [query, requestHeaders] = await Promise.all([searchParams, headers()]);
  const brand = brandFromHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")) ?? "barbacue";
  const tableToken = typeof query.mesa === "string" ? query.mesa : undefined;
  return <SelfServiceMenu key={`${brand}:${tableToken ?? "pickup"}`} mode="kiosk" brand={brand} tableToken={tableToken} />;
}
