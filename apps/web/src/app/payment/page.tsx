import { isBrand } from "@/lib/brands";
import { headers } from "next/headers";
import { brandFromHost } from "@/lib/brand-storefront";
import { getCustomerSession } from "@/lib/customer-session";
import { getTableSession } from "@/lib/table-session";
import { PaymentClient } from "@/components/PaymentClient";

export const dynamic = "force-dynamic";

export default async function PaymentPage({ searchParams }: { searchParams: Promise<{ brand?: string; from?: string }> }) {
  const query = await searchParams;
  const [prefill, table, requestHeaders] = await Promise.all([getCustomerSession(), getTableSession(), headers()]);
  const brand = isBrand(query.brand) ? query.brand : brandFromHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")) ?? "barbacue";
  return <PaymentClient prefill={query.from === "chat" ? null : prefill} table={query.from === "chat" ? null : table} brand={brand} backHref={query.from === "chat" ? `/atendimento/${brand}` : "/cart"} />;
}
