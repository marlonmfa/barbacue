import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {scryptSync,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=process.env.QA_APP_ROOT;assert.ok(root);
assert.equal(process.env.COGIA_SSO_DISPOSABLE_QA,'1');assert.equal(new URL(process.env.DATABASE_URL).pathname,'/barbacue_sso_candidate_qa');
const require=createRequire(path.join(root,'apps/web/package.json'));const {Client}=require('pg');const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
const email=process.env.TEST_USER_EMAIL,password=process.env.TEST_USER_PASSWORD;assert.ok(email&&password);
const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex');
await db.query('TRUNCATE staff_users,customer_accounts RESTART IDENTITY CASCADE');
for(const [name,username,role,permissions,active,first]of[
 ['Pessoa Cog QA',email,'cashier',['dashboard'],true,false],['Pessoa Nativa QA','local-'+email,'admin',null,true,false],
 ['Primeiro acesso QA','first-'+email,'cashier',['dashboard'],true,true],['Desativada QA','disabled-'+email,'admin',null,false,false]])
 await db.query('INSERT INTO staff_users(name,username,password_hash,role,permissions,active,must_change_password) VALUES($1,$2,$3,$4,$5,$6,$7)',[name,username,hash,role,permissions===null?null:JSON.stringify(permissions),active,first]);
for(const [name,mail]of[['Cliente Cog QA','member-'+email],['Cliente Nativo QA','customer-'+email]])
 await db.query('INSERT INTO customer_accounts(name,email,password_hash) VALUES($1,$2,$3)',[name,mail,hash]);
let revoked=false,endFails=true,identityDown=false;
const bridge=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('Content-Type','application/json');
 if(req.url==='/qa/state'){
  if(req.method==='POST'){const state=JSON.parse(raw);if('endFails'in state)endFails=state.endFails;if('identityDown'in state)identityDown=state.identityDown;}
  const counts=(await db.query('SELECT (SELECT count(*)::int FROM staff_users) AS staff,(SELECT count(*)::int FROM customer_accounts) AS members')).rows[0];
  return res.end(JSON.stringify({email,revoked,endFails,...counts}));
 }
 assert.equal(req.headers.authorization,'Bearer qa-scoped-key');assert.equal(req.headers['x-cog-service'],'barbacue');
 if(req.url==='/encerrar'){if(!endFails)revoked=true;return res.writeHead(endFails?503:200).end('{}');}
 if(identityDown)return res.writeHead(503).end('{}');
 const token=JSON.parse(raw).token;const emails={central:email,member:'member-'+email,first:'first-'+email,disabled:'disabled-'+email,unmapped:'unmapped-'+email};
 if(!emails[token]||revoked)return res.writeHead(401).end('{}');
 res.end(JSON.stringify({email:emails[token],email_verified:true}));
});await new Promise(r=>bridge.listen(46076,'127.0.0.1',r));
Object.assign(process.env,{COGIA_SSO_IDENTITY_KEY:'qa-scoped-key',COGIA_SSO_SERVICE:'barbacue',COGIA_SSO_API_URL:'http://127.0.0.1:46076',NEXT_DIST_DIR:'.next-mobile-session-20261024',NODE_ENV:'production',APP_URL:'http://127.0.0.1:54675',OPENAI_API_KEY:'',ASAAS_API_KEY:'',BOT_API_TOKEN:'',PRINT_AGENT_TOKEN:''});
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','46075'],{cwd:path.join(root,'apps/web'),env:process.env,stdio:'inherit'});
async function stop(){child.kill('SIGTERM');bridge.close();await db.end();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);child.on('exit',code=>{bridge.close();void db.end();process.exitCode=code||0;});
