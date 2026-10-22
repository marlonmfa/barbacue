import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin-auth";
import { WhatsAppPortal } from "./WhatsAppPortal";

export const dynamic = "force-dynamic";

// Administrator-only: this console pairs the business number and exposes every
// customer conversation. The proxy enforces the same rule; this is defense in depth.
export default async function WhatsAppPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session || session.role !== "admin") redirect("/admin/login?next=/whatsapp");
  return <WhatsAppPortal />;
}
