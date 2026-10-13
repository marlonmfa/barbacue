import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,cpSync,openSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const backup='/root/deploy-backups/barbacue-erp-20260920';
const candidate='/root/barbacue-next-erp-20260920';
const production=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='barbacue');assert(production);
assert(existsSync(backup+'/database.dump') && existsSync(backup+'/application.tar.gz'), 'Verified backup required');
const env={...process.env,...production.pm2_env.env};
for(const [key,value]of Object.entries(production.pm2_env))if(/^(DATABASE_URL|ADMIN_|OPENAI_|DOMAIN|PUBLIC_SITE_URL|BOT_|PRINT_|DELIVERY_)/.test(key)&&typeof value==='string')env[key]=value;
assert(env.DATABASE_URL&&env.ADMIN_COOKIE_SECRET);
const require=createRequire('/root/barbacue/apps/web/server.js'),{Pool}=require('pg');
const pool=new Pool({connectionString:env.DATABASE_URL});
// Preserve the current private installer and cache chunks for already-open tabs.
cpSync('/root/barbacue/apps/web/private-downloads',candidate+'/apps/web/private-downloads',{recursive:true});
const dist=candidate+'/apps/web/.next-erp-release-20260920';
for(const name of readdirSync('/root/barbacue/apps/web'))if(name.startsWith('.next')&&existsSync('/root/barbacue/apps/web/'+name+'/static'))cpSync('/root/barbacue/apps/web/'+name+'/static',dist+'/static',{recursive:true,force:false,errorOnExist:false});
process.env.DATABASE_URL=env.DATABASE_URL;
await import(pathToFileURL(candidate+'/apps/web/scripts/migrate-erp.mjs').href);
const recipes=(await pool.query('select brand,count(*)::int recipes from erp_recipes group by brand order by brand')).rows;
const missing=(await pool.query("select (select count(*) from products p where not exists(select 1 from erp_recipes r where r.catalog_key='barbacue:'||p.id)) native,(select count(*) from brand_catalog_products p where not exists(select 1 from erp_recipes r where r.catalog_key=p.brand||':'||p.external_id)) managed")).rows[0];assert.equal(Number(missing.native),0);assert.equal(Number(missing.managed),0);await pool.end();
const fd=openSync(backup+'/candidate.log','a',0o600);
const child=spawn(process.execPath,[candidate+'/apps/web/server.js'],{cwd:candidate,env:{...env,NODE_ENV:'production',PORT:'43009',HOSTNAME:'127.0.0.1'},detached:true,stdio:['ignore',fd,fd]});child.unref();writeFileSync(backup+'/candidate.pid',String(child.pid));
const base='http://127.0.0.1:43009',checks=[];
const payload=`0|admin|${Date.now()+600000}`,cookie=`barbacue_admin=${payload}.${createHmac('sha256',env.ADMIN_COOKIE_SECRET).update(payload).digest('base64url')}`;
async function get(path,expected=200,auth='',host='barbacue.cog.ia.br'){const r=await fetch(base+path,{redirect:'manual',headers:{Host:host,'X-Forwarded-Host':host,Cookie:auth},signal:AbortSignal.timeout(30000)});assert.equal(r.status,expected,path);checks.push({path,status:r.status,host});return r;}
try{
 let ready=false;for(let i=0;i<30;i++){try{if((await fetch(base+'/admin/login')).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500));}assert(ready,'Candidate startup');
 for(const [brand,host]of [['barbacue','barbacue.cog.ia.br'],['chelas','chelas.hirableaiagents.com'],['barbadog','barbadog.hirableaiagents.com']]){
  for(const path of ['/?loja=1','/api/products','/api/settings','/api/store-status',`/atendimento/${brand}`,'/icon.png','/apple-icon.png']){const r=await get(path,200,'',host);await r.arrayBuffer();}
 }
 await get('/api/admin/erp',401);await get('/api/admin/downloads/windows',401);await get('/admin/erp',307);
 for(const path of ['/admin','/admin/erp','/admin/team','/admin/staff','/admin/orders','/admin/catalogs','/admin/kitchen','/admin/waiter','/admin/tables','/admin/customers','/admin/settings','/admin/delivery-settings','/admin/downloads','/admin/system','/api/admin/employees','/api/admin/orders','/api/admin/catalogs','/api/admin/staff','/api/admin/customers','/api/admin/coupons','/api/admin/tables','/api/admin/settings','/api/admin/delivery-settings','/api/admin/kitchen/printing']){const r=await get(path,200,cookie);await r.arrayBuffer();}
 const erp=await(await get('/api/admin/erp',200,cookie)).json();assert.equal(erp.recipes.length,recipes.reduce((s,r)=>s+r.recipes,0));assert(erp.recipes.every(r=>r.status==='review'));
 const image=await get('/_next/image?url=%2Fbrand%2Fbarbacue-logo-t.png&w=640&q=75');assert(image.headers.get('content-type').startsWith('image/'));await image.arrayBuffer();
 const manifest=JSON.parse(readFileSync(candidate+'/apps/web/private-downloads/windows.json','utf8'));
 const file=await get('/api/admin/downloads/windows',200,cookie);const hash=createHash('sha256');let size=0;for await(const chunk of file.body){hash.update(chunk);size+=chunk.length;}assert.equal(size,manifest.size);assert.equal(hash.digest('hex'),manifest.sha256);
 const report={success:true,buildId:readFileSync(dist+'/BUILD_ID','utf8').trim(),recipes,checks,installer:{size,sha256:manifest.sha256},backup};writeFileSync(backup+'/preflight.json',JSON.stringify(report,null,2));console.log(JSON.stringify({success:true,buildId:report.buildId,recipes,checks:checks.length,installerVerified:true,backup},null,2));
}catch(e){process.kill(child.pid,'SIGTERM');console.error(e.message);process.exitCode=1;}
