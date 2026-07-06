import { getCustomerSession } from "@/lib/customer-session";
import { getTableSession } from "@/lib/table-session";
import { PaymentClient } from "@/components/PaymentClient";

export const dynamic = "force-dynamic";

export default async function PaymentPage() {
  const [prefill, table] = await Promise.all([getCustomerSession(), getTableSession()]);
  return <PaymentClient prefill={prefill} table={table} />;
}
