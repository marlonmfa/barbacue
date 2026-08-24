import { requireStaff } from "@/lib/admin-auth";
import { WhatsAppPortal } from "./WhatsAppPortal";

export default async function WhatsAppPage() {
  await requireStaff();
  return <WhatsAppPortal />;
}
