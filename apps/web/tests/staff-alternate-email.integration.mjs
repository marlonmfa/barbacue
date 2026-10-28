import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { scryptSync, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import path from 'node:path';

const root = process.env.FIRST_ACCESS_TEST_ROOT;
assert(root, 'Set FIRST_ACCESS_TEST_ROOT to the isolated candidate');
const database = process.env.DATABASE_URL;
assert.equal(new URL(database).pathname, '/barbacue_first_access_test_20261027');
assert(['localhost','127.0.0.1'].includes(new URL(database).hostname));
const db = new Pool({ connectionString: database });
const mail = []; let failMail = false; let count = 0; let child;
const bridge = createServer(async (req,res) => {
  assert.equal(req.url, '/enviar'); assert.equal(req.headers.authorization, 'Bearer fixture-only');
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (failMail) return res.writeHead(503).end('{}');
  mail.push(JSON.parse(raw)); res.writeHead(201, {'Content-Type':'application/json'}).end('{}');
});
const password = 'Initial-test-2026', replacement = 'Personal-test-2026';
const suffix = randomBytes(6).toString('hex'); const ids = [];
async function request(route, body, cookie='', status=200) {
  const response = await fetch('http://127.0.0.1:43123'+route, { method: body ? 'POST':'GET', redirect:'manual', headers:{'Content-Type':'application/json', cookie, 'x-forwarded-for':`127.0.1.${++count}`}, body:body?JSON.stringify(body):undefined });
  const text=await response.text(); assert.equal(response.status,status,route+': '+text.slice(0,180));
  let data;try{data=JSON.parse(text)}catch{data=text}
  return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const emailPath='/api/admin/change-password/email';
const change={currentPassword:password,password:replacement,confirmation:replacement};
try {
  await new Promise(r=>bridge.listen(43124,'127.0.0.1',r));
  child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','43123'],{cwd:path.join(root,'apps/web'),env:{...process.env,NEXT_DIST_DIR:'.next-mobile-session-20261024',NODE_ENV:'production',ADMIN_COOKIE_SECRET:'isolated-first-access-test-secret',COGMAIL_API_URL:'http://127.0.0.1:43124',COGMAIL_API_TOKEN:'fixture-only',COGIA_SSO_IDENTITY_KEY:'',COG_OIDC_CLIENT_ID:'',COG_NATIVE_IDENTITY_KEY:'',OPENAI_API_KEY:'',ASAAS_API_KEY:''},stdio:['ignore','pipe','pipe']});
  for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:43123/admin/login');break}catch{await new Promise(r=>setTimeout(r,200))}}
  await request(emailPath,{action:'send',email:'alternate@example.test'},'',401);
  for(let index=0;index<2;index++){
    const username=`${index}-${suffix}@barbacue.cog.ia.br`;const salt=randomBytes(16);const hash=salt.toString('hex')+':'+scryptSync(password,salt,64).toString('hex');
    const {rows:[user]}=await db.query("INSERT INTO staff_users(name,username,password_hash,role,must_change_password) VALUES ('Fixture',$1,$2,'admin',true) RETURNING id",[username,hash]);ids.push(user.id);
    const login=await request('/api/admin/auth',{username,password});assert(login.data.mustChangePassword);const cookie=login.cookie;
    await request('/api/admin/orders',null,cookie,403);
    await request('/api/admin/change-password',change,cookie,409);
    await request(emailPath,{action:'send',email:username},cookie,422);
    await request(emailPath,{action:'send',email:'invalid'},cookie,422);
    failMail=true;await request(emailPath,{action:'send',email:'alternate@example.test'},cookie,503);failMail=false;
    assert.equal((await db.query('select * from staff_alternate_emails where user_id=$1',[user.id])).rowCount,0);
    await request(emailPath,{action:'send',email:'alternate@example.test'},cookie);
    assert.deepEqual(mail.at(-1).para,['alternate@example.test']);let code=mail.at(-1).texto.match(/\b\d{6}\b/)[0];
    await request(emailPath,{action:'send',email:'other@example.test'},cookie,429);
    await request(emailPath,{action:'verify',code:'000000'},cookie,422);
    await request('/api/admin/change-password',change,cookie,409);
    if(index===1){
      for(let i=0;i<4;i++)await request(emailPath,{action:'verify',code:'000000'},cookie,422);
      await request(emailPath,{action:'verify',code},cookie,422);
      await db.query("update staff_alternate_emails set sent_at=now()-interval '2 minutes' where user_id=$1",[user.id]);
      await request(emailPath,{action:'send',email:'alternate@example.test'},cookie,429);
      await db.query("update staff_alternate_emails set expires_at=now()-interval '1 second' where user_id=$1",[user.id]);
      await request(emailPath,{action:'verify',code},cookie,422);
      await request(emailPath,{action:'send',email:'alternate@example.test'},cookie);
      code=mail.at(-1).texto.match(/\b\d{6}\b/)[0];
    }
    await request(emailPath,{action:'verify',code},cookie);
    await request(emailPath,{action:'verify',code},cookie,422);
    const changed=await request('/api/admin/change-password',change,cookie);
    assert(changed.cookie);await request('/api/admin/auth',null,changed.cookie);
    await request('/api/admin/auth',null,cookie,401);
    await request('/api/admin/auth',{username,password},'',401);
    const personal=await request('/api/admin/auth',{username,password:replacement});assert.equal(personal.data.mustChangePassword,false);
    await request(emailPath,{action:'send',email:'other@example.test'},personal.cookie,401);
    const {rows:[stored]}=await db.query('select * from staff_alternate_emails where user_id=$1',[user.id]);assert(stored.verified_at);assert.equal(stored.code_hash,null);
  }
  console.log(`PASS: ${count} HTTP checks, two first-access accounts; mock mail only.`);
} finally {
  child?.kill('SIGTERM');bridge.close();await db.query('delete from staff_users where id=ANY($1)',[ids]);await db.end();
}
