import { getCustomerSession } from "@/lib/customer-session";
import { PaymentClient } from "@/components/PaymentClient";

export default async function PaymentPage() {
  const prefill = await getCustomerSession();
  return <PaymentClient prefill={prefill} />;
}
