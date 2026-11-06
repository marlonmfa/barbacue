import LoginForm from './LoginForm';
import { getStaffSession } from '@/lib/admin-auth';
import { landingPath } from '@/lib/permissions';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function LoginPage(){
  const session=await getStaffSession();
  if(session)redirect(session.mustChangePassword?'/admin/change-password':landingPath(session));
  return <LoginForm/>;
}
