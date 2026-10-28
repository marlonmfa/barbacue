import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
process.env.ZAP_API_TOKEN='test-zap-token';process.env.ZAP_API_BASE_URL='https://zap.test/api';process.env.ZAP_WEBHOOK_SECRET='webhook-secret';process.env.ZAP_SESSION_ID='';process.env.ZAP_WEBHOOK_URL='';
const originalFetch=globalThis.fetch;
const targets={central:'5547999718315',barbacue:'5547997056624',barbadog:'5547933892175',chelas:'5547988249667'};
let calls=[],rows=[],zap;
before(async()=>{zap=await import('../dist/wa/zap-hub.js')});
beforeEach(()=>{
 calls=[];rows=[{sessionId:'unrelated',name:'Other project',status:'disconnected'},...Object.keys(targets).map(id=>({sessionId:`session-${id}`,name:`barbacue:${id}`,status:'disconnected'}))];
 globalThis.fetch=async(input,init={})=>{
  const path=new URL(String(input)).pathname;calls.push({path,init});
  if(path==='/api/whatsapp/sessions' && init.method==='POST'){const {name}=JSON.parse(init.body);const row={sessionId:`new-${name}`,name,status:'disconnected'};rows.push(row);return Response.json(row,{status:201})}
  if(path==='/api/whatsapp/sessions')return Response.json(rows);
  const match=path.match(/\/sessions\/([^/]+)\/(status|pair|sync|disconnect)$/);
  if(match){const row=rows.find(r=>r.sessionId===decodeURIComponent(match[1]));assert(row,'Known session');if(match[2]==='pair'){row.status='connecting';row.qrDataUrl='old-qr';row.pairingCode='ABCD-EFGH'}if(match[2]==='disconnect')row.status='disconnected';return Response.json(row)}
  if(path==='/api/messages')return Response.json({messageId:`sent-${calls.length}`},{status:201});
  return Response.json({ok:true});
 };
});
after(()=>{for(const id of Object.keys(targets))zap.closePairingWindow(id);globalThis.fetch=originalFetch});
test('four independent phone pairing targets use the correct remote sessions without QR requests',async()=>{
 for(const [id,phone]of Object.entries(targets)){
  const result=await zap.pair(id,'phone',phone);assert.equal(result.id,id);assert.equal(result.pairingCode,'ABCD-EFGH');
  const call=calls.find(c=>c.path===`/api/whatsapp/sessions/session-${id}/pair`);assert(call);assert.deepEqual(JSON.parse(call.init.body),{phoneNumber:phone});
 }
 assert.equal(zap.accountList().length,4);assert.equal(calls.some(c=>c.path.endsWith('/sync')),false);assert.equal(calls.some(c=>c.path.includes('/unrelated/')),false);
 assert.match(calls[0].init.headers.authorization,/^Bearer test-zap-token$/);
});
test('rejects incorrect target and unknown accounts before changing remote sessions',async()=>{
 await assert.rejects(zap.pair('central','phone',targets.barbacue),/número configurado/);
 await assert.rejects(zap.pair('unknown','phone'),/inválida/);assert.equal(calls.length,0);
});
test('keeps connected accounts and disconnects only the explicitly selected one',async()=>{
 rows.find(r=>r.sessionId==='session-chelas').status='connected';
 await assert.rejects(zap.pair('chelas','phone',targets.chelas),/já está pareada/);
 assert.equal(calls.some(c=>c.path.endsWith('/pair')),false);
 await zap.disconnect('barbadog');assert.equal(calls.filter(c=>c.path.endsWith('/disconnect')).length,1);assert(calls.some(c=>c.path.endsWith('/session-barbadog/disconnect')));
 assert.equal(zap.accountList().find(a=>a.id==='chelas').status,'connected');
});
test('signed webhooks reply on their own session and isolate equal contacts across brands',async()=>{
 for(const row of rows)row.status='connected';await zap.startHub();
 const received=[];zap.onInboundMessage(async(phone,text,connection)=>{received.push({phone,text,connection});return {brand:connection==='central'?'barbacue':connection,messages:['Olá!']}});
 const jid='5511999999999@s.whatsapp.net';
 for(const id of ['chelas','barbadog'])await zap.handleWebhook({event:'message.incoming',data:{sessionId:`session-${id}`,whatsappJid:jid,messageId:`in-${id}`,body:`oi-${id}`}});
 assert.deepEqual(received.map(r=>r.connection),['chelas','barbadog']);
 const sends=calls.filter(c=>c.path==='/api/messages').map(c=>JSON.parse(c.init.body));assert.deepEqual(sends.map(s=>s.sessionId),['session-chelas','session-barbadog']);
 assert.equal(zap.messageList('chelas',jid).some(m=>m.text==='oi-barbadog'),false);
 assert.equal((await zap.chatList('chelas'))[0].connection,'chelas');
 const count=received.length;await zap.handleWebhook({event:'message.incoming',data:{sessionId:'unrelated',whatsappJid:jid,body:'ignore'}});assert.equal(received.length,count);
 await zap.handleWebhook({event:'message.incoming',data:{sessionId:'session-chelas',whatsappJid:jid,messageId:'in-chelas',body:'oi-chelas'}});assert.equal(received.length,count);
 const raw='{"event":"message.incoming"}',sig=createHmac('sha256','webhook-secret').update(raw).digest('hex');assert(zap.verifyWebhookSignature(raw,`sha256=${sig}`));assert.equal(zap.verifyWebhookSignature(raw,'wrong'),false);
});
test('restart discovers named sessions without adopting unrelated accounts or creating new ones',async()=>{
 const fresh=await import('../dist/wa/zap-hub.js?restart');try{await fresh.startHub();assert.equal(calls.some(c=>c.init.method==='POST'),false);assert.equal(calls.some(c=>c.path.includes('/unrelated/')),false)}finally{for(const id of Object.keys(targets))fresh.closePairingWindow(id)}
});
test('a missing brand creates only its named session and is rediscovered after restart',async()=>{
 rows=rows.filter(row=>row.name!=='barbacue:chelas');
 const fresh=await import('../dist/wa/zap-hub.js?create-brand');
 let restarted;
 try{
  const result=await fresh.pair('chelas','phone',targets.chelas);assert.equal(result.pairingCode,'ABCD-EFGH');
  const created=calls.filter(c=>c.path==='/api/whatsapp/sessions'&&c.init.method==='POST');assert.equal(created.length,1);assert.deepEqual(JSON.parse(created[0].init.body),{name:'barbacue:chelas'});
  calls=[];restarted=await import('../dist/wa/zap-hub.js?rediscover-created');await restarted.startHub();assert.equal(calls.some(c=>c.init.method==='POST'),false);assert.equal(restarted.accountList().find(a=>a.id==='chelas').pairingCode,'ABCD-EFGH');
 }finally{for(const id of Object.keys(targets)){fresh.closePairingWindow(id);restarted?.closePairingWindow(id)}}
});
