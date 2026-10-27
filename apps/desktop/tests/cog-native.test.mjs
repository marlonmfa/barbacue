import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cogRequestTarget, createBarbacueCogSession } from '../src/cog-session.mjs';
import { createNativeCogTransport } from '../../web/src/lib/cog-native.ts';
import auth from '../src/cog-oauth.cjs';
const token=randomBytes(32).toString('base64url');
test('native grants are attached only to first-party admin requests',()=>{
 const origin='https://barbacue.cog.ia.br';
 assert.equal(cogRequestTarget(origin+'/admin/orders',origin),true);
 assert.equal(cogRequestTarget(origin+'/api/admin/auth',origin),true);
 for(const target of [origin+'/api/chat',origin+'/api/account','https://evil.example/api/admin/auth','https://barbacue.cog.ia.br.evil.test/admin',origin+'@evil.example/admin'])assert.equal(cogRequestTarget(target,origin),false);
 assert.equal(cogRequestTarget('https://custom.example/admin','https://custom.example'),false);
 assert.equal(cogRequestTarget('http://127.0.0.1:54795/admin','http://127.0.0.1:54795'),false);
 assert.equal(cogRequestTarget('http://127.0.0.1:54795/admin','http://127.0.0.1:54795',true),true);
});
test('backend accepts only this native audience and verified email; no secret in scoped revoke',async()=>{
 let value={sub:'qa',aud:'barbacue-native',email_verified:true,email:'QA@cog.ia.br'},status=200,body;
 const transport=createNativeCogTransport(async(url,options)=>{
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  if(url.endsWith('/revoke'))body=new URLSearchParams(options.body);
  else assert.equal(options.headers.Authorization,'Bearer '+token);
  return Response.json(value,{status});
 });
 assert.equal(await transport.resolve(token),'qa@cog.ia.br');
 for(const change of [{aud:'copypaste-native'},{email_verified:false},{sub:''},{email:'invalid'}]){const before=value;value={...value,...change};assert.equal(await transport.resolve(token),null);value=before;}
 assert.equal(await transport.resolve('malformed'),null);
 status=503;assert.equal(await transport.resolve(token),null);await assert.rejects(transport.end(token));
 status=200;await transport.end(token);assert.equal(body.get('client_id'),'barbacue-native');assert.equal(body.has('client_secret'),false);
});
test('native client rejects untrusted issuer and does not persist a grant',()=>{
 assert.throws(()=>auth.createCogAuth({issuer:'https://evil.example',openExternal:async()=>{}}));
 assert.throws(()=>auth.createCogAuth({issuer:'http://remote.example',qa:true,openExternal:async()=>{}}));
 const client=auth.createCogAuth({openExternal:async()=>{}});assert.equal(client.activeToken(),null);client.clear();assert.equal(client.status().hasGrant,false);
});

test('real loopback PKCE flow keeps the grant in main memory and confirms revoke before clearing',async()=>{
 try{process.loadEnvFile('/Users/marlonalcantara/Repos/.env.default');}catch{}
 const email=process.env.TEST_USER_EMAIL||'teste@teste.com';
 const crypto=await import('node:crypto');const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'qa',alg:'RS256',use:'sig'};let authorize,fail=true,offline=false;
 const jwt=()=>{const now=Math.floor(Date.now()/1000);const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'qa'})).toString('base64url');const p=Buffer.from(JSON.stringify({iss:'https://id.cog.ia.br',aud:'barbacue-native',sub:email,email,email_verified:true,nonce:authorize.searchParams.get('nonce'),iat:now,exp:now+3600})).toString('base64url');const data=h+'.'+p;return data+'.'+crypto.sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');};
 const client=auth.createCogAuth({openExternal:async value=>{
  authorize=new URL(value);assert.equal(authorize.searchParams.get('prompt'),'none');assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');
  const callback=new URL(authorize.searchParams.get('redirect_uri'));callback.search=new URLSearchParams({state:authorize.searchParams.get('state'),code:'qa-one-use-code'});
  const response=await fetch(callback);assert.equal(response.status,200);await response.text();
 },fetch:async(url,options)=>{
  assert.equal(new URL(url).origin,'https://id.cog.ia.br');
  if(url.endsWith('/token')){
   const p=new URLSearchParams(options.body);assert.equal(p.get('client_id'),'barbacue-native');assert.equal(p.has('client_secret'),false);assert.equal(p.get('redirect_uri'),authorize.searchParams.get('redirect_uri'));
   assert.equal(crypto.createHash('sha256').update(p.get('code_verifier')).digest('base64url'),authorize.searchParams.get('code_challenge'));
   return Response.json({access_token:token,expires_in:3600,token_type:'Bearer',id_token:jwt()});
  }
  if(url.endsWith('/jwks.json'))return Response.json({keys:[jwk]});
  if(url.endsWith('/userinfo'))return Response.json({sub:email,email,email_verified:true,aud:'barbacue-native'},{status:offline?503:200});
  assert(url.endsWith('/revoke'));return Response.json({},{status:fail?503:200});
 }});
 try{
  assert.equal((await client.signIn()).email,email);assert.equal(client.activeToken(),token);
  await assert.rejects(client.signOut());assert.equal(client.activeToken(),token);
  offline=true;assert.equal(await client.currentIdentity(),null);assert.equal(client.activeToken(),null);
  offline=false;assert.equal((await client.currentIdentity()).email,email);assert.equal(client.activeToken(),token);
  fail=false;await client.signOut();assert.equal(client.activeToken(),null);assert.equal(client.status().hasGrant,false);
 }finally{client.clear();}
});

test('native shell suppresses web bootstrap without a grant and strips untrusted headers',async()=>{
 let send;
 const app={isPackaged:false,once(){}};
 const session={fromPartition(){return {webRequest:{onBeforeSendHeaders(_f,fn){send=fn;},onHeadersReceived(){}}};}};
 const client=createBarbacueCogSession({app,session,openExternal:async()=>{},getOrigin:()=>'https://barbacue.cog.ia.br'});
 const pending=client.ready();
 const request=url=>new Promise(resolve=>send({url,requestHeaders:{'x-barbacue-cog':'forged','X-Barbacue-Native':'forged'}},resolve));
 try{
  assert.deepEqual((await request('https://barbacue.cog.ia.br/admin')).requestHeaders,{'X-Barbacue-Native':'1'});
  assert.deepEqual((await request('https://evil.example/admin')).requestHeaders,{});
 }finally{client.close();await pending;}
});
