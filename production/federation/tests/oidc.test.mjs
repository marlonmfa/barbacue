import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root=process.env.COGIA_SSO_TEST_APP_ROOT;
assert.ok(root && root!='/root/barbacue/apps/web');
const oidc=await import(pathToFileURL(root+'/src/lib/cog-oidc.ts'));
const {actorView}=await import(pathToFileURL(root+'/src/lib/session-view.ts'));
Object.assign(process.env,{ADMIN_COOKIE_SECRET:'unit-only-secret-with-at-least-32-characters',COG_OIDC_ORIGINS:JSON.stringify({'https://chelas.hirableaiagents.com':'chelas','https://barbadog.hirableaiagents.com':'barbadog'}),
 COG_OIDC_CLIENT_ID:'barbacue-external',COG_OIDC_CLIENT_SECRET:'unit-only-confidential-secret'});
const config=oidc.oidcConfig('https://chelas.hirableaiagents.com');
test('only the configured canonical origin and tenant can use the confidential RP',()=>{
 assert.ok(config);assert.equal(oidc.oidcConfig('https://evil.example'),null);
 assert.equal(oidc.oidcConfig('https://barbadog.hirableaiagents.com').tenant,'barbadog');
 assert.equal(oidc.oidcConfig(config.origin+'@evil.example'),null);
});
test('silent flow uses independent state/nonce and S256; return stays in the local app',async()=>{
 const flow=await oidc.startFlow(config,'//evil.example');const url=new URL(flow.url);
 assert.equal(url.origin,'https://id.cog.ia.br');assert.equal(url.searchParams.get('prompt'),'none');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('code_challenge').length,43);
 assert.notEqual(url.searchParams.get('state'),url.searchParams.get('nonce'));
 assert.equal(url.searchParams.get('redirect_uri'),config.origin+'/api/auth/cog/callback');
 const data=await oidc.unseal(config,'flow',flow.cookie);assert.equal(data.next,'/admin');
 assert.equal(oidc.safeNext('/crm\\evil'),'/admin');assert.equal(oidc.safeNext('/crm/funil?q=1'),'/crm/funil?q=1');
 assert.ok(!flow.cookie.includes(data.verifier));
});
test('encrypted grant is purpose, tenant, client, issuer and host bound',async()=>{
 const cookie=await oidc.seal(config,'grant',{token:'opaque-private-token',email:'qa@cog.ia.br',sub:'qa'},60);
 assert.ok(!cookie.includes('opaque-private-token'));
 assert.equal((await oidc.unseal(config,'grant',cookie)).email,'qa@cog.ia.br');
 for(const change of [{origin:'https://other.example'},{tenant:'kaes'},{client:'other'},{issuer:'https://other.example'}])
   assert.equal(await oidc.unseal({...config,...change},'grant',cookie),null);
 assert.equal(await oidc.unseal(config,'flow',cookie),null);
 assert.equal(await oidc.unseal(config,'grant',cookie.slice(0,-4)+'xxxx'),null);
});
test('expired and oversized cookies are rejected',async()=>{
 const cookie=await oidc.seal(config,'grant',{token:'expired',email:'qa@cog.ia.br',sub:'qa'},-1);
 assert.equal(await oidc.unseal(config,'grant',cookie),null);
 assert.equal(await oidc.unseal(config,'grant','x'.repeat(4000)),null);
});
test('callback needs browser-bound state even for provider errors',async()=>{
 const flow=await oidc.startFlow(config,'/crm/agenda');const state=new URL(flow.url).searchParams.get('state');
 await assert.rejects(oidc.completeFlow(config,flow.cookie,new URLSearchParams({state:'wrong',error:'login_required'})));
 await assert.rejects(oidc.completeFlow(config,undefined,new URLSearchParams({state,error:'login_required'})));
 const result=await oidc.completeFlow(config,flow.cookie,new URLSearchParams({state,error:'login_required'}));
 assert.deepEqual(result,{next:'/crm/agenda',grant:null});
});
test('live userinfo must match sealed subject and verified email; failures fall back',async t=>{
 const cookie=await oidc.seal(config,'grant',{token:'private',email:'qa@cog.ia.br',sub:'qa'},60);
 let value={email:'qa@cog.ia.br',sub:'qa',email_verified:true},status=200;
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');return new Response(JSON.stringify(value),{status});});
 assert.equal(await oidc.resolveOidcEmail(config,cookie),'qa@cog.ia.br');
 value={...value,email_verified:false};assert.equal(await oidc.resolveOidcEmail(config,cookie),null);
 value={...value,email_verified:true,sub:'other'};assert.equal(await oidc.resolveOidcEmail(config,cookie),null);
 status=503;assert.equal(await oidc.resolveOidcEmail(config,cookie),null);
});
test('revocation failure surfaces before any caller may clear sessions',async t=>{
 const cookie=await oidc.seal(config,'grant',{token:'private',email:'qa@cog.ia.br',sub:'qa'},60);
 let status=503;
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,config.issuer+'/revoke');assert.equal(new URLSearchParams(init.body).get('client_secret'),config.secret);return new Response('{}',{status});});
 await assert.rejects(oidc.revokeOidc(config,cookie));status=200;await oidc.revokeOidc(config,cookie);
});
test('view binds the staff role, permissions and customer separately',async()=>{
 const staff={userId:1,role:'cashier',permissions:['dashboard'],mustChangePassword:false},member={id:7};
 const view=await actorView(config.origin,staff,member);assert.equal(view.length,43);
 for(const [origin,s,m] of [[config.origin,null,member],[config.origin,staff,null],['https://other.example',staff,member],
 [config.origin,{...staff,permissions:['team']},member],[config.origin,{...staff,role:'admin'},member],[config.origin,staff,{id:8}]])
 assert.notEqual(await actorView(origin,s,m),view);
});
