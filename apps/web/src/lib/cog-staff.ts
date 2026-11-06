import type { CogIdentity } from './cog-identity';
import type { AdminSession } from './admin-auth';
export const COG_STAFF_SENTINEL = '!cog-sso-only';
export function technicalStaff(user: { passwordHash?: string } | null | undefined) {
  return user?.passwordHash === COG_STAFF_SENTINEL;
}
/** Only the verified own COG actor is projected; no native staff authority is saved. */
export async function findCogAdminStaff(identity: CogIdentity): Promise<AdminSession | null> {
  if (identity.admin !== true) return null;
  const {db}=await import('@/db');const {staffUsers}=await import('@/db/schema');const {sql}=await import('drizzle-orm');
  const select=()=>db.select().from(staffUsers).where(sql`lower(${staffUsers.username}) = ${identity.email}`).limit(2);
  let users=await select();
  if (!users.length) {
    await db.insert(staffUsers).values({name:identity.email,username:identity.email,passwordHash:COG_STAFF_SENTINEL,active:false,role:'employee',permissions:[],mustChangePassword:false,jobTitle:null}).onConflictDoNothing({target:staffUsers.username});
    users=await select();
  }
  if (users.length!==1) return null;
  const user=users[0];
  if (!technicalStaff(user) && (user.active!==true || user.mustChangePassword===true)) return null;
  return {userId:user.id,role:'admin',name:user.name,jobTitle:user.jobTitle,permissions:null,mustChangePassword:false,cogAdmin:true,cogNative:identity.source==='native',email:identity.email};
}
