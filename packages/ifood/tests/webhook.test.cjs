const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { receiveWebhook, enqueueEvents } = require('../src/webhook.ts');
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
    assert.equal(calls[0],'BEGIN'); assert.ok(calls.some(s=>s.includes('ON CONFLICT (event_id) DO NOTHING')));
    assert.equal(calls.at(-1),fail?'ROLLBACK':'COMMIT');assert.equal(released,true);
  }
});
