const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { receiveWebhook, enqueueEvents, eventAudit, recordProcessedEvent } = require('../src/webhook.ts');
const { webhookAudit } = require('../src/webhook-audit.ts');
const { ifoodLocalId } = require('../src/order-store.ts');
const { DEFAULT_MERCHANTS } = require('../src/merchants.ts');
const cfg = { clientSecret: 'test-secret', merchants: DEFAULT_MERCHANTS, dryRun: false };
const event = (i) => ({ id: `evt-${i}`, code: 'PLC', orderId: '00000000-0000-4000-8000-000000000001', merchantId: DEFAULT_MERCHANTS[i].id });
const sign = raw => createHmac('sha256', cfg.clientSecret).update(raw).digest('hex');
test('signed events from three stores are committed before receipt is confirmed', async () => {
  const raw = Buffer.from(JSON.stringify(DEFAULT_MERCHANTS.map((_,i) => event(i))));
  let committed = false;
  assert.equal(await receiveWebhook(raw, sign(raw), cfg, async events => { assert.deepEqual(events.map(e=>e.merchantId), DEFAULT_MERCHANTS.map(m=>m.id)); await Promise.resolve(); committed=true; }), 202);
  assert.equal(committed, true);
});
test('signature is checked on original bytes and fails closed before touching DB', async () => {
  const raw = Buffer.from(JSON.stringify(event(0)));
  const noWrite = async () => assert.fail('must not enqueue');
  assert.equal(await receiveWebhook(raw, undefined, cfg, noWrite), 401);
  assert.equal(await receiveWebhook(Buffer.concat([raw, Buffer.from(' ')]), sign(raw), cfg, noWrite), 401);
  assert.equal(await receiveWebhook(raw, sign(raw), {...cfg, clientSecret:''}, noWrite), 401);
});
test('unknown stores and malformed/mixed batches are rejected atomically', async () => {
  for (const body of [[event(0), {...event(1), merchantId: 'unknown'}], {...event(0), orderId: null}, [], null]) {
    const raw=Buffer.from(JSON.stringify(body));
    assert.equal(await receiveWebhook(raw, sign(raw), cfg, async()=>assert.fail('must not enqueue')), 400);
  }
});
test('database outage and simulation cannot acknowledge business events', async () => {
  const raw=Buffer.from(JSON.stringify(event(0)));
  assert.equal(await receiveWebhook(raw, sign(raw), cfg, async()=>{throw new Error('DB down');}),503);
  assert.equal(await receiveWebhook(raw, sign(raw), {...cfg,dryRun:true},async()=>assert.fail()),503);
});
test('KEEPALIVE is answered without order API or business queue', async () => {
  const raw=Buffer.from(JSON.stringify({id:'presence',code:'KEEPALIVE'}));
  assert.equal(await receiveWebhook(raw, sign(raw), cfg, async()=>assert.fail()),202);
});
test('batch insertion is atomic, deduplicates IDs, and rolls back failed commits', async () => {
  for (const fail of [false,true]) {
    const calls=[];let released=false;
    const pool={connect:async()=>({query:async(sql)=>{calls.push(sql); if(fail&&sql==='COMMIT')throw new Error('commit failed');},release(){released=true;}})};
    if(fail) await assert.rejects(enqueueEvents(pool,[event(0)])); else await enqueueEvents(pool,[event(0)]);
    assert.equal(calls[0],'BEGIN'); assert.ok(calls.some(s=>s.includes('ON CONFLICT (event_id) DO UPDATE')));
    assert.equal(calls.at(-1),fail?'ROLLBACK':'COMMIT');assert.equal(released,true);
  }
});
test('audit preserves order, event type and source time without retaining customer data', () => {
  const e={...event(0),fullCode:'PLACED',createdAt:'2026-10-23T22:30:00-03:00',metadata:{customer:{name:'private'}}};
  assert.deepEqual(eventAudit(e),{order_id:e.orderId,event_code:'PLC',event_full_code:'PLACED',event_created_at:'2026-10-24T01:30:00.000Z'});
  assert.equal(eventAudit({...e,createdAt:'invalid'}).event_created_at,null);
  assert.equal(eventAudit({...event(0)}).event_created_at,null);
});
test('redelivery enriches missing history but never resets receipt, processing or payload',async()=>{
  const calls=[];
  const pool={connect:async()=>({query:async(sql,args)=>{calls.push([sql,args]);},release(){}})};
  const e={...event(0),fullCode:'PLACED',createdAt:'2026-10-24T01:30:00Z'};
  await enqueueEvents(pool,[e]);
  const [sql,args]=calls.find(([s])=>s.includes('INSERT INTO'));
  const duplicate=sql.split('ON CONFLICT')[1];
  assert.ok(!/processed_at\s*=|received_at\s*=|payload\s*=|attempts\s*=/.test(duplicate));
  assert.match(duplicate,/merchant_id=EXCLUDED.merchant_id/);
  const stored=JSON.parse(args[0])[0];
  assert.equal(stored.order_id,e.orderId);assert.equal(stored.event_code,'PLC');
  assert.equal(stored.event_created_at,'2026-10-24T01:30:00.000Z');
});
test('completion clears raw payload but keeps metadata and the matching panel order',async()=>{
  const e={...event(1),fullCode:'CONFIRMED',code:'CFM',createdAt:'2026-10-24T01:30:00Z'};
  const calls=[];const localId=ifoodLocalId(e.orderId);
  const pool={query:async(sql,args)=>{calls.push([sql,args]);return{rows:sql.startsWith('SELECT')?[{id:localId,status:'confirmed'}]:[]};}};
  await recordProcessedEvent(pool,e,'barbacue');
  assert.deepEqual(calls[0][1],[localId,'barbacue']);
  assert.match(calls[1][0],/payload=NULL/);
  assert.deepEqual(calls[1][1],[e.id,e.orderId,'CFM','CONFIRMED','2026-10-24T01:30:00.000Z',localId,'confirmed']);
});
test('unknown panel order remains explicitly unlinked; audit is read only and bounded',async()=>{
  const calls=[];const pool={query:async(sql,args)=>{calls.push([sql,args]);return{rows:[]};}};
  await recordProcessedEvent(pool,event(0),'chelas');
  assert.deepEqual(calls[1][1].slice(-2),[null,null]);
  await webhookAudit(pool,10);assert.match(calls[2][0],/LEFT JOIN orders/);assert.deepEqual(calls[2][1],[10]);
  for(const n of [0,201,NaN]) await assert.rejects(webhookAudit(pool,n));
});
