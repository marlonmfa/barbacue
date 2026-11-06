import { canAccessPath } from "@/lib/permissions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin-auth";
import { WhatsAppPortal } from "./WhatsAppPortal";

export const dynamic = "force-dynamic";

// Administrator-only: this console pairs the business number and exposes every
// customer conversation. The proxy enforces the same rule; this is defense in depth.
export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const session = await requireStaff().catch(() => null);
  if (!session || !canAccessPath(session, "/whatsapp")) redirect("/admin/login?next=/whatsapp");
  const query = await searchParams;
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const requested = query.brand;
  const initialFilter = requested === "all" || requested === "barbacue" || requested === "barbadog" || requested === "chelas"
    ? requested : host.startsWith("chelas.") ? "chelas" : host.startsWith("barbadog.") ? "barbadog" : "barbacue";
  return <WhatsAppPortal initialFilter={initialFilter} manageConnection={session.role === "admin"} />;
}
