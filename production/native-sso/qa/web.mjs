// Isolated real Linux Next build: schema-only PostgreSQL, synthetic OIDC, no operational accounts.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {randomBytes,createHash,scryptSync} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
assert.equal(process.env.COGIA_SSO_DISPOSABLE_QA,'1');
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/barbacue_federation_qa');
const require=createRequire(new URL('./apps/web/package.json',import.meta.url));
const {Client}=require('pg');const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
const email=process.env.TEST_USER_EMAIL,password=process.env.TEST_USER_PASSWORD;assert.ok(email&&password);
const origins=['http://127.0.0.1:54795','http://localhost:54795'],issuer='http://localhost:3501';
const secret=randomBytes(32).toString('hex');
Object.assign(process.env,{COGIA_SSO_SERVICE:'barbacue',COGIA_SSO_IDENTITY_KEY:'qa-scoped-key',COGIA_SSO_API_URL:'http://127.0.0.1:3501/api/sso',
 COG_OIDC_CLIENT_ID:'barbacue-external-qa',COG_OIDC_CLIENT_SECRET:secret,COG_OIDC_ISSUER:issuer,
 COG_OIDC_ORIGINS:JSON.stringify({[origins[0]]:'chelas',[origins[1]]:'barbadog'}),DOMAIN_CHELAS:'127.0.0.1',DOMAIN_HOTDOG:'localhost',
 NEXT_DIST_DIR:'.next-mobile-session-20261024',NODE_ENV:'production',APP_URL:origins[0],
 OPENAI_API_KEY:'',ASAAS_API_KEY:'',BOT_API_TOKEN:'',PRINT_AGENT_TOKEN:'',NEXT_TELEMETRY_DISABLED:'1'});
await db.query('TRUNCATE staff_users,customer_accounts RESTART IDENTITY CASCADE');
const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex');
assert.equal((await db.query('SELECT count(*)::int AS n FROM staff_users')).rows[0].n,0);
assert.equal((await db.query('SELECT count(*)::int AS n FROM customer_accounts')).rows[0].n,0);
for(const [name,username,role,permissions,active,first]of[
 ['Pessoa Cog QA',email,'cashier',['dashboard'],true,false],['Pessoa Nativa QA','local-'+email,'admin',null,true,false],
 ['Primeiro acesso QA','first-'+email,'cashier',['dashboard'],true,true],['Desativada QA','disabled-'+email,'admin',null,false,false]])
 await db.query('INSERT INTO staff_users(name,username,password_hash,role,permissions,active,must_change_password) VALUES($1,$2,$3,$4,$5,$6,$7)',[name,username,hash,role,permissions===null?null:JSON.stringify(permissions),active,first]);
for(const [name,mail]of[['Cliente Cog QA','member-'+email],['Cliente Nativo QA','customer-'+email]])
 await db.query('INSERT INTO customer_accounts(name,email,password_hash) VALUES($1,$2,$3)',[name,mail,hash]);
const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk={...await exportJWK(publicKey),kid:'qa-rsa',use:'sig',alg:'RS256'};
let mode='valid',failLogout=true,revoked=false,calls=0,tokenCalls=0,lastAuthorize=null;
const codes=new Map(),grants=new Map();
const chosen=()=>mode==='unmapped'?'unmapped-'+email:mode==='inactive'?'disabled-'+email:mode==='first'?'first-'+email:mode==='member'?'member-'+email:email;
const json=(res,value,status=200)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.writeHead(status).end(JSON.stringify(value));};
const provider=createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,issuer);let raw='';for await(const c of req)raw+=c;
 if(url.pathname==='/jwks.json')return json(res,{keys:[jwk]});
 if(url.pathname==='/authorize'){
  const p=url.searchParams;lastAuthorize=Object.fromEntries(p);
  assert.equal(p.get('client_id'),'barbacue-external-qa');assert.ok(origins.includes(new URL(p.get('redirect_uri')).origin));assert.equal(new URL(p.get('redirect_uri')).pathname,'/api/auth/cog/callback');
  assert.equal(p.get('prompt'),'none');assert.equal(p.get('code_challenge_method'),'S256');
  const back=new URL(p.get('redirect_uri'));back.searchParams.set('state',mode==='wrong-state'?'wrong':p.get('state'));
  if(mode==='absent'||revoked)back.searchParams.set('error','login_required');
  else {const code=randomBytes(32).toString('hex');codes.set(code,{...lastAuthorize,email:chosen(),mode});back.searchParams.set('code',code);}
  return res.writeHead(303,{Location:back.href}).end();
 }
 if(url.pathname==='/token'){
  const p=new URLSearchParams(raw);assert.equal(p.get('client_secret'),secret);assert.equal(p.get('client_id'),'barbacue-external-qa');
  const code=codes.get(p.get('code'));codes.delete(p.get('code'));tokenCalls++;
  if(!code||createHash('sha256').update(p.get('code_verifier')||'').digest('base64url')!==code.code_challenge||p.get('redirect_uri')!==code.redirect_uri)
    return json(res,{error:'invalid_grant'},400);
  const token=randomBytes(32).toString('hex');grants.set(token,{email:code.email,sub:code.email,mode:code.mode});
  const id=await new SignJWT({email:code.email,email_verified:code.mode!=='unverified',nonce:code.mode==='wrong-nonce'?'wrong':code.nonce})
   .setProtectedHeader({alg:'RS256',kid:'qa-rsa'}).setIssuer(issuer).setAudience(code.mode==='wrong-audience'?'other':'barbacue-external-qa')
   .setSubject(code.email).setIssuedAt().setExpirationTime('1h').sign(privateKey);
  return json(res,{access_token:token,token_type:'Bearer',expires_in:3600,id_token:id});
 }
 if(url.pathname==='/userinfo'){
  if(mode==='offline')return json(res,{},503);
  const g=grants.get(req.headers.authorization?.slice(7));
  if(!g||revoked)return json(res,{},401);
  return json(res,{email:g.email,sub:g.sub,email_verified:g.mode!=='unverified'});
 }
 if(url.pathname==='/revoke'){
  const p=new URLSearchParams(raw);assert.equal(p.get('client_secret'),secret);calls++;
  if(failLogout)return json(res,{},503);
  revoked=true;grants.delete(p.get('token'));return json(res,{});
 }
 if(url.pathname.startsWith('/api/sso/')){
  assert.equal(req.headers.authorization,'Bearer qa-scoped-key');assert.equal(req.headers['x-cog-service'],'barbacue');
  const token=JSON.parse(raw||'{}').token;
  if(token==='central')return json(res,{email,email_verified:true});
  return json(res,{},401);
 }
 return json(res,{},404);
 }catch(error){console.error(error.message);json(res,{},500);}
});
await new Promise(r=>provider.listen(3501,'0.0.0.0',r));
const control=createServer(async(req,res)=>{
 if(req.method==='POST') {let raw='';for await(const c of req)raw+=c;const s=JSON.parse(raw);if(s.mode)mode=s.mode;if('failLogout'in s)failLogout=s.failLogout;if('revoked'in s)revoked=s.revoked;}
 json(res,{email,mode,failLogout,revoked,calls,tokenCalls,lastAuthorize,counts:(await db.query('SELECT (SELECT count(*)::int FROM staff_users) AS staff,(SELECT count(*)::int FROM customer_accounts) AS members')).rows[0]});
});
await new Promise(r=>control.listen(3502,'0.0.0.0',r));
const next=spawn(process.execPath,[new URL('./apps/web/server.js',import.meta.url).pathname],{env:{...process.env,PORT:'54750',HOSTNAME:'0.0.0.0',NODE_OPTIONS:'--import /qa/native-fetch.mjs'},stdio:'inherit'});
async function stop(){next.kill('SIGTERM');await db.end();provider.close();control.close();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);next.on('exit',code=>{process.exitCode=code||0;void db.end();provider.close();control.close();});
