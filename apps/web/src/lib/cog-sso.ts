import type { CogIdentity } from "./cog-identity";
import { resolveNativeCogIdentity, NATIVE_COG_HEADER } from "./cog-native";
import { cache } from "react";
import { oidcConfig, requestOrigin, resolveOidcIdentity } from "./cog-oidc";
/** Verified identity only; no password, signup or role assignment. */
export const resolveCogIdentity = cache(async (token: string | undefined, requestHeaders?: Pick<Headers,"get">, grant?: string): Promise<CogIdentity | null> => {
  const native = await resolveNativeCogIdentity(requestHeaders?.get(NATIVE_COG_HEADER));
  if (native) return native;
  const federated = requestHeaders ? await resolveOidcIdentity(oidcConfig(requestOrigin(requestHeaders)), grant) : null;
  if (federated) return federated;
  const key=process.env.COGIA_SSO_IDENTITY_KEY;
  if(!key || !token || token.length>128)return null;
  try {
    const response=await fetch((process.env.COGIA_SSO_API_URL || 'https://cog.ia.br/api/sso').replace(/\/$/,'')+'/identidade',{
      method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),
      headers:{Authorization:'Bearer '+key,'X-Cog-Service':process.env.COGIA_SSO_SERVICE || 'barbacue','Content-Type':'application/json'},body:JSON.stringify({token})});
    if(!response.ok)return null;
    const data=await response.json();
    return data.email_verified===true && typeof data.email==='string' && data.email.includes('@')?{email:data.email.trim().toLowerCase(),admin:data.cog_admin===true,source:"cookie"}:null;
  }catch{return null;}
});
export const resolveCogEmail = cache(async (token: string | undefined, requestHeaders?: Pick<Headers,"get">, grant?: string) => (await resolveCogIdentity(token,requestHeaders,grant))?.email ?? null);
export function uniqueEligibleAccount<T extends {id:number;active?:boolean|null;mustChangePassword?:boolean}>(users:T[],staff=false):T|null {
  if(users.length!==1)return null;
  const user=users[0];
  return staff && (user.active!==true || user.mustChangePassword===true)?null:user;
}
export async function endCogSession(token:string|undefined):Promise<void> {
  if(!token || !process.env.COGIA_SSO_IDENTITY_KEY)return;
  const response=await fetch((process.env.COGIA_SSO_API_URL || 'https://cog.ia.br/api/sso').replace(/\/$/,'')+'/encerrar',{
    method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+process.env.COGIA_SSO_IDENTITY_KEY,
      'X-Cog-Service':process.env.COGIA_SSO_SERVICE || 'barbacue','Content-Type':'application/json'},body:JSON.stringify({token})});
  if(!response.ok)throw new Error('Não foi possível encerrar a sessão Cog. Tente novamente.');
}
