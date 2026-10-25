import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.env.COGIA_SSO_TEST_ROOT;
assert.ok(root && root!=='/root/barbacue','Use a prepared disposable source tree');
const {resolveCogEmail,uniqueEligibleAccount,endCogSession}=await import(pathToFileURL(path.join(root,'apps/web/src/lib/cog-sso.ts')).href);
test('Cog identity never creates/promotes accounts or bypasses first-password/disabled status',()=>{
  const user={id:1,role:'cashier',active:true,mustChangePassword:false,permissions:['orders']};
  assert.equal(uniqueEligibleAccount([user],true),user);
  assert.equal(uniqueEligibleAccount([],true),null);
  assert.equal(uniqueEligibleAccount([user,{...user,id:2}],true),null);
  assert.equal(uniqueEligibleAccount([{...user,active:false}],true),null);
  assert.equal(uniqueEligibleAccount([{...user,mustChangePassword:true}],true),null);
  const customer={id:3,name:'Cliente QA',email:'teste@teste.com'};
  assert.equal(uniqueEligibleAccount([customer]),customer);
});
test('identity is verified server-to-server; failures fall back and logout requires confirmation',async t=>{
  const before={...process.env};t.after(()=>{process.env=before;});
  process.env.COGIA_SSO_IDENTITY_KEY='qa-scoped-key';process.env.COGIA_SSO_SERVICE='barbacue';
  let verified=true,status=200;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.headers['X-Cog-Service'],'barbacue');assert.deepEqual(JSON.parse(options.body),{token:'central'});
    return new Response(JSON.stringify({email:'TESTE@TESTE.COM',email_verified:verified}),{status});
  });
  assert.equal(await resolveCogEmail('central'),'teste@teste.com');verified=false;
  assert.equal(await resolveCogEmail('central'),null);status=503;
  assert.equal(await resolveCogEmail('central'),null);await assert.rejects(endCogSession('central'));
  status=200;await endCogSession('central');assert.equal(await resolveCogEmail(undefined),null);
});
