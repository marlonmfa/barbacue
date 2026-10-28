import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const require=createRequire(new URL('../../../package.json',import.meta.url));
const {chromium,_electron:electron}=require('playwright');
const repo=path.resolve(import.meta.dirname,'../../..');
const scratch='/tmp/barbacue-native-baseline-20261026';
const creds=JSON.parse(await fs.readFile(scratch+'/qa-credentials.private.json'));
const base='http://127.0.0.1:54795',issuer='http://127.0.0.1:54796';
const control=async data=>{const r=await fetch(issuer+'/qa/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200);};
await fetch('http://127.0.0.1:54797',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'absent'})});
const browser=await chromium.launch({channel:'chrome'}),context=await browser.newContext(),chrome=await context.newPage();
const native=await context.request.post(base+'/api/admin/auth',{data:{username:'local-'+creds.TEST_USER_EMAIL,password:creds.TEST_USER_PASSWORD},headers:{Origin:base}});
assert.equal(native.status(),200);const cookie=native.headers()['set-cookie'].match(/barbacue_admin=([^;]+)/)[1];
const shots=path.join(repo,'test-screenshots');await fs.mkdir(shots,{recursive:true});
let application;
try {
 for(const mode of ['valid','unmapped','absent','inactive','first']) {
  console.log('case',mode);await control({mode,fail_logout:true});
  const userData=await fs.mkdtemp(path.join(scratch,'electron-'+mode+'-'));
  const settings={serverUrl:base,encryptedToken:'',printer:'',paper:80,autoPrint:false,startAtLogin:false};
  await fs.writeFile(path.join(userData,'settings.json'),JSON.stringify(settings),{mode:0o600});
  application=await electron.launch({executablePath:require('electron'),args:[scratch+'/source/qa-entry.mjs'],env:{...process.env,BARBACUE_DESKTOP_TEST_DATA:userData,BARBACUE_COG_DISPOSABLE_QA:'1',BARBACUE_COG_QA_ISSUER:issuer,QA_NATIVE_COOKIE:cookie}});
  const external=await application.evaluate(async()=>{for(let i=0;i<200;i++){if(globalThis.qaCogUrls?.length)return globalThis.qaCogUrls.shift();await new Promise(r=>setTimeout(r,50));}throw Error('No native authorize URL');});
  const url=new URL(external);assert.equal(url.origin,issuer);assert.equal(url.searchParams.get('client_id'),'barbacue-native');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  await chrome.goto(external);await chrome.getByText(/Você pode voltar ao aplicativo/).waitFor();
  let page;for(let i=0;i<100;i++){page=application.windows().find(p=>p.url().startsWith(base));if(page)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(page,'actual published main opened its panel: '+mode+' '+application.windows().map(p=>p.url()).join(','));
  const expected=mode==='valid'?'Pessoa Cog QA':'Pessoa Nativa QA';await page.getByText(expected,{exact:true}).waitFor({timeout:20000});
  const api=async endpoint=>page.evaluate(async p=>{const r=await fetch(p,{cache:'no-store'});return {status:r.status,body:await r.json()};},endpoint);
  let identity=await api('/api/admin/auth');assert.equal(identity.body.session.authSource,mode==='valid'?'cog':'native');
  assert.equal(await application.evaluate(async({session})=>(await session.fromPartition('persist:barbacue-store').cookies.get({name:'barbacue_admin'}))[0]?.value),cookie);
  if(mode==='valid') {
   assert.equal(identity.body.session.role,'cashier');assert.deepEqual(identity.body.session.permissions,['dashboard']);
   assert.equal((await api('/api/admin/staff')).status,403);
   await page.screenshot({path:path.join(shots,'barbacue-native-cog-priority-2026-10-27.png'),fullPage:true});
   await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByRole('button',{name:'Tentar sair novamente',exact:true}).waitFor();
   await page.getByText(expected,{exact:true}).waitFor();await page.screenshot({path:path.join(shots,'barbacue-native-cog-revoke-error-2026-10-27.png'),fullPage:true});
   await control({fail_logout:false});await page.getByRole('button',{name:'Tentar sair novamente',exact:true}).click();
   await page.getByText('Pessoa Nativa QA',{exact:true}).waitFor();
   assert.equal((await api('/api/admin/auth')).body.session.authSource,'native');
   await page.screenshot({path:path.join(shots,'barbacue-native-cog-local-restored-2026-10-27.png'),fullPage:true});
  } else if(['unmapped','absent'].includes(mode)){await page.getByText('Nenhum pedido.',{exact:true}).waitFor();await page.screenshot({path:path.join(shots,`barbacue-native-cog-${mode}-2026-10-27.png`),fullPage:true});}
  assert.equal(await application.evaluate(async({session})=>(await session.fromPartition('persist:barbacue-store').cookies.get({name:'barbacue_admin'}))[0]?.value),cookie);
  assert.equal(await fs.readFile(path.join(userData,'settings.json'),'utf8'),JSON.stringify(settings));
  await application.evaluate(({app})=>app.quit());await application.close();application=null;console.log('passed',mode);
 }
 const counts=await(await fetch('http://127.0.0.1:54797')).json();assert.deepEqual(counts.counts,{staff:4,members:2});
 console.log('PASS: actual published Electron main + Chrome + real Linux IDP/Next; priority/permissions/revoke error/local restore/unmapped/absent/inactive/first-access; cookie/settings unchanged');
}finally{await application?.close().catch(()=>{});await browser.close();}
