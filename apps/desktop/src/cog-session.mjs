import auth from './cog-oauth.cjs';
const trusted = new Set(['https://barbacue.cog.ia.br','https://chelas.hirableaiagents.com','https://barbadog.hirableaiagents.com']);
export function cogRequestTarget(value, origin, qa = false) {
 try {
  const url=new URL(value),base=new URL(origin);
  const allowed=trusted.has(base.origin)||(qa&&base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname));
  return allowed&&url.origin===base.origin&&!url.username&&!url.password&&!base.username&&!base.password&&base.pathname==='/'&&!base.search&&!base.hash&&
   (/^\/admin(?:\/|$)/.test(url.pathname)||/^\/api\/admin(?:\/|$)/.test(url.pathname)||url.pathname==='/api/auth/cog/session');
 } catch { return false; }
}
/** Main-process-only token, isolated from local cookies and print-agent keys. */
export function createBarbacueCogSession({app,session,openExternal,getOrigin,onChange=()=>{},issuer='https://id.cog.ia.br',qa=false,fetch=globalThis.fetch}) {
 if(qa&&app.isPackaged)throw new Error('QA is unavailable in a packaged application');
 let current=null,origin='',pending=null,stopped=false,lastIdentity='';
 const jar=session.fromPartition('persist:barbacue-store');
 jar.webRequest.onBeforeSendHeaders({urls:['http://*/*','https://*/*']},(details,callback)=>{
  const headers={...details.requestHeaders};
  for(const key of Object.keys(headers))if(['x-barbacue-cog','x-barbacue-native'].includes(key.toLowerCase()))delete headers[key];
  const token=current?.activeToken();
  if(cogRequestTarget(details.url,origin,qa)){
   headers['X-Barbacue-Native']='1';
   if(token)headers['X-Barbacue-Cog']=token;
  }
  callback({requestHeaders:headers});
 });
 jar.webRequest.onHeadersReceived({urls:['http://*/*','https://*/*']},(details,callback)=>{
  const url=new URL(details.url);const ended=Object.entries(details.responseHeaders||{}).some(([k,v])=>k.toLowerCase()==='x-barbacue-cog-ended'&&v.includes('1'));
  if(ended&&cogRequestTarget(details.url,origin,qa)&&url.pathname==='/api/admin/auth'&&details.statusCode>=200&&details.statusCode<300)current?.clear();
  callback({responseHeaders:details.responseHeaders});
 });
 async function ready() {
  if(stopped)return;
  let next;try{next=new URL(getOrigin()).origin;}catch{return;}
  if(next===origin)return pending;
  current?.cancel();current=null;origin=next;
  if(!cogRequestTarget(next+'/admin',next,qa))return;
  const selected=auth.createCogAuth({clientId:'barbacue-native',issuer,qa,openExternal,fetch,onIdentity:(identity)=>{
   const identityKey=identity?JSON.stringify([next,identity.sub,identity.email]):'';
   if(origin===next&&!stopped&&identityKey!==lastIdentity){lastIdentity=identityKey;onChange();}
  }});
  current=selected;pending=selected.signIn().finally(()=>{if(current===selected)pending=null;});
  return pending;
 }
 const watch=setInterval(()=>{void ready().catch(()=>{});},1000);watch.unref?.();
 const recheck=setInterval(()=>{void current?.currentIdentity().catch(()=>{});},30000);recheck.unref?.();
 function close(){stopped=true;current?.cancel();clearInterval(watch);clearInterval(recheck);}
 app.once('before-quit',close);
 return {ready,close,signOut:()=>current?.signOut(),status:()=>current?.status()||{hasGrant:false,pending:false}};
}
