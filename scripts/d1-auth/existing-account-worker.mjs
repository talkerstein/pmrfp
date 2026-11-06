import {betterAuth} from 'better-auth';
import {rehearsalOptions} from './rehearsal.mjs';
import {gatewayMatches} from './private-gateway.mjs';
const origin='https://pmrfp-existing-test-auth-preview.pmrfp.workers.dev';
const email='d1-preview-20261022@example.invalid';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(error,status)=>Response.json({error},{status,headers});
/** Prepared only. Exactly one existing test identity, no signup/reset/mail/customer access. */
export default {
 async fetch(request,env){
  if(!await gatewayMatches(request.headers.get('x-pmrfp-auth-preview-key'),env.GATEWAY_SECRET))return reply('unauthorized',401);
  const url=new URL(request.url);
  if(env.MODE!=='existing-test-account-only'||url.origin!==origin||!env.AUTH_DB||typeof env.AUTH_SECRET!=='string'||env.AUTH_SECRET.length<32)return reply('invalid_preview_configuration',503);
  let userId;
  try{
   const marker=await env.AUTH_DB.prepare('SELECT mode,user_id,expires_at FROM _auth_test_preview_manifest WHERE id=1').first();
   const rows=await env.AUTH_DB.prepare('SELECT id,email,emailVerified,role,banned,banExpires FROM user LIMIT 2').all();
   const account=rows.results?.[0];
   if(marker?.mode!=='existing-test-account-only'||typeof marker.expires_at!=='string'||!Number.isFinite(Date.parse(marker.expires_at))||Date.parse(marker.expires_at)<=Date.now()||Date.parse(marker.expires_at)>Date.now()+900000||rows.results?.length!==1||account?.id!==marker.user_id||account.email!==email||account.emailVerified!==1||account.role!=='user'||(account.banned!==0&&!(account.banned===1&&typeof account.banExpires==='string'&&Date.parse(account.banExpires)<=Date.now())))throw Error('Invalid test identity');
   userId=account.id;
  }catch{return reply('existing_test_account_required',503);}
  if(url.pathname==='/__migration/health'&&request.method==='GET'&&!url.search)return Response.json({mode:'existing-test-account-only',customerAccounts:0},{headers});
  const endpoint=url.pathname.slice('/api/auth/'.length);
  if(!url.pathname.startsWith('/api/auth/')||url.search||!['sign-in/email','get-session','sign-out'].includes(endpoint))return reply('not_found',404);
  if(endpoint==='get-session'?request.method!=='GET':request.method!=='POST')return reply('invalid_request',400);
  let forwarded=request;
  if(request.method==='POST'){
   if(request.headers.get('origin')!==origin||!request.headers.get('content-type')?.startsWith('application/json'))return reply('invalid_request',400);
   try{
    const reader=request.body?.getReader();if(!reader)throw Error('Body required');
    const chunks=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2048)throw Error('Bound exceeded');chunks.push(part.value);}}finally{await reader.cancel();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const body=JSON.parse(text);
    if(endpoint==='sign-in/email'?(body.email!==email||typeof body.password!=='string'||Buffer.byteLength(body.password)>72||Object.keys(body).some(k=>!['email','password'].includes(k))):Object.keys(body).length!==0)throw Error('Unexpected input');
    forwarded=new Request(request,{body:text});
   }catch{return reply('invalid_request',400);}
  }
  try{
   const options=rehearsalOptions(env.AUTH_DB,env.AUTH_SECRET);
   options.session={...options.session,expiresIn:900,updateAge:900};
   const auth=betterAuth({...options,baseURL:origin,trustedOrigins:[origin]});
   const response=await auth.handler(forwarded);
   if(endpoint==='get-session'&&response.ok){const value=await response.clone().json();if(value&&value.user?.id!==userId)return reply('invalid_session',401);}
   const secured=new Response(response.body,response);for(const [key,value] of Object.entries(headers))secured.headers.set(key,value);return secured;
  }catch{return reply('auth_preview_unavailable',503);}
 }
};
