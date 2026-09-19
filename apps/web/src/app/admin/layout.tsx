import { requireStaff } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // requireStaff never throws here in practice — the proxy already redirected
  // unauthenticated requests to /admin/login before this layout renders.
  const session = await requireStaff().catch(() => null);
  if (!session) return children;
  return <AdminShell role={session.role} permissions={session.permissions} name={session.name} jobTitle={session.jobTitle}>{children}</AdminShell>;
}
