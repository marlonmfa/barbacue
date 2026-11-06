import { STAFF_ROLES, effectivePermissions, type Access, type AccessRole } from "@/lib/permissions";

export const OPERATIONAL_STAFF_ROLES = ["cashier", "kitchen", "waiter", "driver", "employee"] as const;
export function manageableStaffRoles(actor: Access): readonly AccessRole[] {
  return actor.role === "admin" ? STAFF_ROLES : actor.role === "manager" ? OPERATIONAL_STAFF_ROLES : [];
}
/** A manager can grant only their own permissions and cannot take over a more privileged account. */
export function canManageStaffAccount(actor: Access, target: Access): boolean {
  if (actor.role === "admin") return true;
  return actor.role === "manager" && manageableStaffRoles(actor).includes(target.role)
    && effectivePermissions(target).every(permission => effectivePermissions(actor).includes(permission));
}
