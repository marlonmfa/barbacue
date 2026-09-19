import { headers } from "next/headers";
import { SelfServiceMenu } from "@/components/SelfServiceMenu";
import { brandFromHost } from "@/lib/brand-storefront";
import { getTableSession } from "@/lib/table-session";

export const dynamic = "force-dynamic";

export default async function TableOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ mesa?: string | string[] }>;
}) {
  const [query, requestHeaders, session] = await Promise.all([searchParams, headers(), getTableSession()]);
  const brand = brandFromHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")) ?? "barbacue";
  // An explicitly invalid QR must never fall back to a previous table's cookie.
  const tableToken = query.mesa === undefined ? session?.token : typeof query.mesa === "string" ? query.mesa : "invalid";
  return <SelfServiceMenu key={`${brand}:${tableToken ?? "missing-table"}`} mode="table_qr" brand={brand} tableToken={tableToken} />;
}
