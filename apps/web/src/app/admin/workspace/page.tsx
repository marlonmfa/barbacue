import { requireStaff } from "@/lib/admin-auth";
import { WorkHome } from "@/components/admin/WorkHome";
export default async function WorkspacePage() { return <WorkHome account={await requireStaff()} />; }
