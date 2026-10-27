import assert from 'node:assert/strict';
assert.equal(process.env.BARBACUE_DISPOSABLE_QA,'1');
const original=globalThis.fetch;
globalThis.fetch=(url,init)=>{
 const value=typeof url==='string'?url:url instanceof URL?url.href:null;
 if(value==='https://id.cog.ia.br/userinfo'||value==='https://id.cog.ia.br/revoke')
  return original(process.env.QA_NATIVE_ISSUER+new URL(value).pathname,init);
 return original(url,init);
};
