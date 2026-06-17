import { getCustomerSession } from "@/lib/customer-session";
import { CartClient } from "@/components/CartClient";

export default async function CartPage() {
  const prefill = await getCustomerSession();
  return <CartClient prefill={prefill} />;
}
