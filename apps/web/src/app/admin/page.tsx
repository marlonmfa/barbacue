import { OperationsDashboard } from "@/components/admin/OperationsDashboard";
import { requireStaff } from "@/lib/admin-auth";
import { can, landingPath } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await requireStaff();
  if (!can(session, "dashboard")) redirect(landingPath(session));
  const data = await getDashboardData();
  return <OperationsDashboard {...data} canUseWhatsApp={session.role === "admin"} />;
}
