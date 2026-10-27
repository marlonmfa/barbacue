'use strict';
// Native Cog identity. Separate from Google credentials, scopes and profile jars.
const crypto = require('node:crypto');
const http = require('node:http');
const ISSUER = 'https://id.cog.ia.br';
const CALLBACK = '/oauth/cog/callback';
const random = () => crypto.randomBytes(32).toString('base64url');
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const emailOf = data => data && data.email_verified === true && typeof data.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(data.email.trim()) ? data.email.trim().toLowerCase() : null;

function verifyIdentityToken(token,jwks,{issuer,clientId,nonce,now=Date.now()}) {
  if(typeof token!=='string'||token.length>16384)throw new Error('Identidade Cog inválida.');
  const parts=token.split('.');if(parts.length!==3)throw new Error('Identidade Cog inválida.');
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString());
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  const keys=Array.isArray(jwks.keys)?jwks.keys:[];
  const key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  if(header.alg!=='RS256'||!key||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))
    throw new Error('Identidade Cog inválida.');
  const seconds=Math.floor(now/1000);
  if(claims.iss!==issuer||!(claims.aud===clientId||(Array.isArray(claims.aud)&&claims.aud.includes(clientId)))||
      (claims.azp&&claims.azp!==clientId)||!same(claims.nonce,nonce)||typeof claims.sub!=='string'||!claims.sub||
      !Number.isFinite(claims.exp)||claims.exp<=seconds||!Number.isFinite(claims.iat)||claims.iat>seconds+60||!emailOf(claims))
    throw new Error('Identidade Cog inválida.');
  return claims;
}

function createCogAuth({clientId='barbacue-native',openExternal,fetch:request=globalThis.fetch,vault=null,
  onIdentity=()=>{},issuer=ISSUER,qa=false,now=Date.now,timeoutMs=60000}={}) {
  const parsed=new URL(issuer);issuer=parsed.origin;
  if(issuer!==ISSUER&&!(qa&&parsed.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)))
    throw new Error('Provedor Cog inválido.');
  if(typeof openExternal!=='function'||typeof request!=='function')throw new TypeError('Native browser and backend transport are required.');
  let grant=null,pending=null,listener=null,cancelPending=null,generation=0,readSequence=0,active=false;
  async function backend(path,init={}) {
    const response=await request(issuer+path,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('Não foi possível confirmar a sessão Cog.');
    const raw=await response.text();if(raw.length>65536)throw new Error('Resposta Cog inválida.');
    return JSON.parse(raw);
  }
  function persist(){if(vault&&grant)vault.write({purpose:'cog-native-v1',issuer,clientId,...grant});}
  async function identityFor(current) {
    if(!current||current.expiresAt<=now())return null;
    const info=await backend('/userinfo',{headers:{Authorization:'Bearer '+current.token}});
    const email=emailOf(info);
    return email&&email===current.email&&info.sub===current.sub&&info.aud===clientId?{sub:info.sub,email,email_verified:true,name:typeof info.name==='string'?info.name:email}:null;
  }
  async function notify(identity){active=Boolean(identity);try{await onIdentity(identity);}catch{/* Native profile state remains authoritative on a failed switch. */}}
  async function currentIdentity() {
    const sequence=++readSequence,current=grant,mine=generation;
    let identity=null;try{identity=await identityFor(current);}catch{/* Offline/revoked identity falls back to local; encrypted grant can be retried. */}
    if(sequence===readSequence&&current===grant&&mine===generation){await notify(identity);return identity;}
    return null;
  }
  async function restore(){
    if(vault){
      try{const value=vault.read();if(value?.purpose==='cog-native-v1'&&value.issuer===issuer&&value.clientId===clientId&&
        typeof value.token==='string'&&value.token.length<=1024&&typeof value.email==='string'&&typeof value.sub==='string'&&Number.isFinite(value.expiresAt))grant=value;}catch{}
    }
    return currentIdentity();
  }
  function signIn({interactive=false}={}) {
    if(pending)return pending;
    const mine=++generation,state=random(),nonce=random(),verifier=crypto.randomBytes(64).toString('base64url');
    const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    pending=new Promise(resolve=>{
      let done=false,consumed=false,timer;
      const finish=async(value)=>{
        if(done)return;done=true;clearTimeout(timer);cancelPending=null;
        if(listener){const closing=listener;listener=null;closing.close();const cleanup=setTimeout(()=>closing.closeAllConnections?.(),1000);cleanup.unref?.();}
        if(mine===generation)await notify(value);
        resolve(value);
      };
      cancelPending=()=>void finish(null);
      listener=http.createServer(async(req,res)=>{
        res.setHeader('Connection','close');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Type','text/html; charset=utf-8');
        const port=listener?.address()?.port;
        const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);
        if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`||url.pathname!==CALLBACK){res.writeHead(404).end('Não encontrado');return;}
        const p=url.searchParams;
        if(consumed||p.getAll('state').length!==1||!same(p.get('state'),state)){res.writeHead(400).end('Fluxo inválido.');return;}
        consumed=true;
        if(p.has('error')){res.end('<title>Cog</title><p>A sessão local foi mantida. Você pode voltar ao aplicativo.</p>');await finish(null);return;}
        try{
          if(p.getAll('code').length!==1||!p.get('code')||p.get('code').length>2048)throw new Error('Código inválido.');
          const redirect=`http://127.0.0.1:${port}${CALLBACK}`;
          const data=await backend('/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,redirect_uri:redirect,code:p.get('code'),code_verifier:verifier}).toString()});
          if(data.token_type?.toLowerCase()!=='bearer'||typeof data.access_token!=='string'||data.access_token.length>1024||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new Error('Resposta inválida.');
          const claims=verifyIdentityToken(data.id_token,await backend('/jwks.json'),{issuer,clientId,nonce,now:now()});
          const candidate={token:data.access_token,email:emailOf(claims),sub:claims.sub,expiresAt:Math.min(now()+Math.min(3600,data.expires_in)*1000,claims.exp*1000)};
          const identity=await identityFor(candidate);
          if(!identity||mine!==generation)throw new Error('Sessão indisponível.');
          grant=candidate;++readSequence;persist();
          res.end('<title>Cog</title><p>Conta Cog confirmada. Você pode voltar ao aplicativo.</p>');await finish(identity);
        }catch{res.end('<title>Cog</title><p>A sessão local foi mantida. Você pode voltar ao aplicativo.</p>');await finish(null);}
      });
      listener.on('error',()=>void finish(null));
      listener.listen(0,'127.0.0.1',()=>{
        const url=new URL('/authorize',issuer);url.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:`http://127.0.0.1:${listener.address().port}${CALLBACK}`,
          scope:'openid email profile',prompt:interactive?'login':'none',state,nonce,code_challenge:challenge,code_challenge_method:'S256'}).toString();
        Promise.resolve().then(()=>openExternal(url.href)).catch(()=>void finish(null));
      });
      timer=setTimeout(()=>void finish(null),timeoutMs);timer.unref?.();
    }).finally(()=>{pending=null;});
    return pending;
  }
  async function signOut(){
    const current=grant;
    if(current){await backend('/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,token:current.token}).toString()});}
    ++generation;++readSequence;cancelPending?.();grant=null;vault?.clear();await notify(null);
  }
  function cancel(){++generation;++readSequence;cancelPending?.();}
  function clear(){cancel();grant=null;active=false;void notify(null);}
  function activeToken(){return active&&grant?.expiresAt>now()?grant.token:null;}
  return {restore,signIn,currentIdentity,signOut,cancel,clear,activeToken,status:()=>({pending:Boolean(pending),hasGrant:Boolean(grant),expiresAt:grant?.expiresAt||null})};
}
module.exports={createCogAuth,verifyIdentityToken,emailOf};
