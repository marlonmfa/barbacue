import { getCustomerSession } from "@/lib/customer-session";
import { getTableSession } from "@/lib/table-session";
import { CartClient } from "@/components/CartClient";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const [prefill, table] = await Promise.all([getCustomerSession(), getTableSession()]);
  return <CartClient prefill={prefill} table={table} />;
}
