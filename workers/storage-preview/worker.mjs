import {gatewayMatches} from '../../scripts/d1-auth/private-gateway.mjs';

const hex64=/^[a-f0-9]{64}$/;
const imageTypes=new Set(['image/jpeg','image/png','image/webp']);
const privacy={'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"};
const reject=(status)=>new Response(null,{status,headers:privacy});

const encoder=new TextEncoder();
const signedOrigin='https://pmrfp-verified-public-assets-preview.pmrfp.workers.dev';
const signedMessage=(item,expiry)=>encoder.encode(`pmrfp-r2-preview-v1:${item.id}:${item.sha256}:${expiry}`);
const keyFor=secret=>typeof secret==='string'&&secret.length>=32&&secret.length<=512?crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']):null;
const matches=(object,item)=>object&&object.size===item.bytes&&object.httpMetadata?.contentType===item.type&&object.etag===item.md5;

/** Only audited public images, in a separate bucket with no private archive binding. */
export function assetReader(manifest){
 if(!Array.isArray(manifest)||manifest.length<1||manifest.length>1000)throw Error('Invalid asset inventory');
 const entries=new Map();
 for(const item of manifest){
  if(!item||!hex64.test(item.id)||!hex64.test(item.sha256)||!/^[a-f0-9]{32}$/.test(item.md5)||!imageTypes.has(item.type)||!Number.isSafeInteger(item.bytes)||item.bytes<=0||item.bytes>100*1024*1024||entries.has(item.id))throw Error('Invalid asset identity');
  entries.set(item.id,{...item,key:`verified-public/${item.id}/${item.sha256}`});
 }
 return {async fetch(request,env){
  const url=new URL(request.url),match=/^\/v1\/assets\/([a-f0-9]{64})(\/link)?$/.exec(url.pathname);
  const gateway=await gatewayMatches(request.headers.get('x-pmrfp-asset-preview-key'),env.GATEWAY_SECRET);
  const item=match&&entries.get(match[1]);const issuing=match?.[2]==='/link';
  const signedMode=env.SIGNED_LINKS==='enabled'&&url.origin===signedOrigin;
  const now=Math.floor(Date.now()/1000);
  if(!gateway){
   if(!signedMode||!item||issuing||!['GET','HEAD'].includes(request.method))return reject(401);
   const expiry=url.searchParams.get('exp'),sig=url.searchParams.get('sig');
   if(!expiry||!/^\d{10}$/.test(expiry)||Number(expiry)<=now||Number(expiry)>now+120||!sig||!hex64.test(sig)||[...url.searchParams.keys()].length!==2)return reject(401);
   try{const key=await keyFor(env.LINK_SECRET);if(!key||!await crypto.subtle.verify('HMAC',key,Uint8Array.from(sig.match(/../g),x=>parseInt(x,16)),signedMessage(item,expiry)))return reject(401);}catch{return reject(401);}
  }
  if(env.MODE!=='verified-public-preview'||!env.PUBLIC_ASSETS)return reject(503);
  if(!match||(gateway&&url.search)||request.headers.has('range'))return reject(400);
  if(issuing){
   if(request.method!=='POST')return reject(405);
   if(!signedMode)return reject(503);if(!item)return reject(404);
   try{
    const object=await env.PUBLIC_ASSETS.head(item.key);if(!object)return reject(404);if(!matches(object,item))return reject(503);
    const key=await keyFor(env.LINK_SECRET);if(!key)return reject(503);
    const expiry=String(now+90),signature=await crypto.subtle.sign('HMAC',key,signedMessage(item,expiry));
    const sig=Array.from(new Uint8Array(signature),x=>x.toString(16).padStart(2,'0')).join('');
    return Response.json({url:`${signedOrigin}/v1/assets/${item.id}?exp=${expiry}&sig=${sig}`},{headers:privacy});
   }catch{return reject(503);}
  }
  if(!['GET','HEAD'].includes(request.method))return reject(405);
  if(!item)return reject(404);
  try{
   const object=await (request.method==='HEAD'?env.PUBLIC_ASSETS.head(item.key):env.PUBLIC_ASSETS.get(item.key));
   if(!object)return reject(404);
   if(!matches(object,item)||(request.method==='GET'&&!object.body))return reject(503);
   return new Response(request.method==='HEAD'?null:object.body,{headers:{...privacy,'content-type':item.type,'content-length':String(item.bytes),'etag':`"${item.md5}"`}});
  }catch{return reject(503);}
 }};
}
