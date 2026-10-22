import {execFileSync,spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync,cpSync,openSync,renameSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='/root/barbacue',candidate='/root/barbacue-next-login-logo-20260920',previous='/root/barbacue-before-login-logo-20260920',backup='/root/deploy-backups/barbacue-login-logo-20260920',dist='.next-login-logo-20260920';
assert(!existsSync(previous));
const proc=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='barbacue');assert.equal(proc.pm2_env.status,'online');
mkdirSync(backup,{recursive:true,mode:0o700});writeFileSync(backup+'/pm2-private.json',JSON.stringify(proc),{mode:0o600});
const env={...process.env,...proc.pm2_env.env};for(const[k,v]of Object.entries(proc.pm2_env))if(/^(DATABASE_URL|ADMIN_|OPENAI_|DOMAIN|PUBLIC_SITE_URL|BOT_|PRINT_|DELIVERY_)/.test(k)&&typeof v==='string')env[k]=v;
for(const name of ['private-downloads','scripts','drizzle'])if(existsSync(root+'/apps/web/'+name))cpSync(root+'/apps/web/'+name,candidate+'/apps/web/'+name,{recursive:true});
for(const name of readdirSync(root+'/apps/web'))if(name.startsWith('.next')&&existsSync(root+'/apps/web/'+name+'/static'))cpSync(root+'/apps/web/'+name+'/static',candidate+'/apps/web/'+dist+'/static',{recursive:true,force:false});
const fd=openSync(backup+'/candidate.log','a',0o600),child=spawn(process.execPath,[candidate+'/apps/web/server.js'],{cwd:candidate,env:{...env,NODE_ENV:'production',PORT:'43010',HOSTNAME:'127.0.0.1'},detached:true,stdio:['ignore',fd,fd]});child.unref();
async function verify(port){const base='http://127.0.0.1:'+port;let ready=false;for(let i=0;i<30;i++){try{if((await fetch(base+'/admin/login')).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500));}assert(ready);const html=await(await fetch(base+'/admin/login')).text();assert(html.includes('alt="Barbacue &amp; Co"'));assert(html.includes('barbacue-logo.png'));assert(!html.includes('<span class="text-4xl">🔥</span>'));const image=await fetch(base+'/_next/image?url=%2Fbrand%2Fbarbacue-logo.png&w=384&q=75');assert.equal(image.status,200);assert(image.headers.get('content-type').startsWith('image/'));for(const path of ['/api/settings','/api/products','/atendimento/barbacue'])assert.equal((await fetch(base+path)).status,200,path);assert.equal((await fetch(base+'/api/admin/erp')).status,401);}
try{await verify(43010)}catch(e){process.kill(child.pid,'SIGTERM');throw e}
process.kill(child.pid,'SIGTERM');
let switched=false;
try{execFileSync('pm2',['stop','barbacue'],{stdio:'ignore'});renameSync(root,previous);switched=true;renameSync(candidate,root);execFileSync('pm2',['restart','barbacue'],{stdio:'ignore'});await verify(3007);execFileSync('pm2',['save'],{stdio:'ignore'});const result={success:true,buildId:readFileSync(root+'/apps/web/'+dist+'/BUILD_ID','utf8').trim(),previous,backup};writeFileSync(backup+'/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
catch(e){execFileSync('pm2',['stop','barbacue'],{stdio:'ignore'});if(switched){if(existsSync(root))renameSync(root,root+'-failed-login-logo-20260920');renameSync(previous,root)}execFileSync('pm2',['restart','barbacue'],{stdio:'ignore'});throw e;}
