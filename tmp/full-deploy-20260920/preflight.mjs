import { execFileSync, spawn } from 'node:child_process';
import { openSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
const candidate='/root/barbacue-next-full-20260920', backup='/root/deploy-backups/barbacue-full-20260920';
const production=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='barbacue');
assert(production?.pm2_env);
const env={...process.env,...production.pm2_env.env,NODE_ENV:'production',PORT:'43008',HOSTNAME:'127.0.0.1'};
for(const [key,value] of Object.entries(production.pm2_env)) if(/^(DATABASE_URL|ADMIN_|OPENAI_|DOMAIN|PUBLIC_SITE_URL|BOT_|PRINT_|DELIVERY_)/.test(key)&&typeof value==='string')env[key]=value;
assert(env.DATABASE_URL&&env.ADMIN_COOKIE_SECRET);
const fd=openSync(`${backup}/candidate.log`,'a',0o600);
const child=spawn(process.execPath,[`${candidate}/apps/web/server.js`],{cwd:candidate,env,detached:true,stdio:['ignore',fd,fd]});child.unref();
writeFileSync(`${backup}/candidate.pid`,String(child.pid));
const base='http://127.0.0.1:43008',results=[];
const get=(path,host='barbacue.cog.ia.br',cookie='')=>fetch(base+path,{redirect:'manual',headers:{Host:host,"X-Forwarded-Host":host,Cookie:cookie},signal:AbortSignal.timeout(30000)});
try{
 let ready=false;
 for(let i=0;i<30;i++){try{if((await get('/admin/login')).status===200){ready=true;break;}}catch{} await new Promise(resolve=>setTimeout(resolve,500));}
 assert(ready,'Candidate startup');
 for(const [brand,host] of [['barbacue','barbacue.cog.ia.br'],['chelas','chelas.hirableaiagents.com'],['barbadog','barbadog.hirableaiagents.com']]){
  for(const path of ['/', '/api/products','/api/settings','/api/store-status',`/atendimento/${brand}`,'/icon.png','/apple-icon.png']){
   const response=await get(path,host);assert.equal(response.status,200,host+path);
   if(path==='/'||path.startsWith('/atendimento/'))assert((await response.text()).includes(`/brand/icons/${brand}-icon.png`),brand+' icon at '+path);else await response.arrayBuffer();
  }
  const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brand,messages:[{role:'user',content:'Olá! Qual é o nome do restaurante que você atende? Não quero fazer um pedido ainda.'}],cart:[]}),signal:AbortSignal.timeout(60000)});
  const data=await response.json();assert.equal(response.status,200,`Live chat ${brand}: ${data.error??''}`);assert.equal(data.brand,brand);assert(data.reply);assert.equal(data.cart.length,0);
  results.push(`${brand}: storefront, icons, catalog, chat route and real AI response healthy`);
 }
 const data=new FormData();data.append('file',new File([readFileSync('/tmp/audio-test.wav')],'pedido.wav',{type:'audio/wav'}));
 const response=await fetch(base+'/api/transcribe',{method:'POST',body:data,signal:AbortSignal.timeout(60000)});
 const transcription=await response.json();assert.equal(response.status,200,`Whisper: ${transcription.error??''}`);assert.match(transcription.text,/lanche/i);assert.match(transcription.text,/frango/i);results.push(`Real Whisper transcription: ${transcription.text}`);
 assert.equal((await get('/api/admin/downloads/windows')).status,401);
 const payload=`0|admin|${Date.now()+120000}`,cookie=`barbacue_admin=${payload}.${createHmac('sha256',env.ADMIN_COOKIE_SECRET).update(payload).digest('base64url')}`;
 for(const path of ['/admin','/admin/downloads','/api/admin/orders','/api/admin/catalogs']) {const r=await get(path,'barbacue.cog.ia.br',cookie);assert.equal(r.status,200,path);await r.arrayBuffer();}
 const manifest=JSON.parse(readFileSync(`${candidate}/apps/web/private-downloads/windows.json`));
 const download=await get('/api/admin/downloads/windows','barbacue.cog.ia.br',cookie);assert.equal(download.status,200);
 const hash=createHash('sha256');let size=0;for await(const chunk of download.body){hash.update(chunk);size+=chunk.length;}
 assert.equal(size,manifest.size);assert.equal(hash.digest('hex'),manifest.sha256);results.push('Administration and private Windows installer preserved');
 writeFileSync(`${backup}/preflight.json`,JSON.stringify({success:true,results},null,2));console.log(JSON.stringify({success:true,results},null,2));
}catch(error){process.kill(child.pid,'SIGTERM');console.error(error.message);process.exitCode=1;}
