import {parseSaveInput,UUID} from './contracts';
import { z } from 'zod';
import { signUpSchema, signupProfileSchema } from '../validations';
import { FT_COOKIE, parseFirstTouch, serializeFirstTouch } from '../attribution/cookie';
import { optedOut } from '../tracking/privacy';
const origin='https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev';
const cookieName='pmrfp-native-preview';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const failure=(error:string,status:number)=>Response.json({error},{status,headers});
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const nativePreviewTokenPattern=/^(?:[A-Za-z0-9._~-]|%[a-fA-F0-9]{2}){16,4096}$/;
const previewSignupSchema = signUpSchema.pick({ email: true, fullName: true, password: true, role: true })
 .extend({ lang: z.enum(['en','fr','es']) }).strict();
export function nativePreviewCookie(request:Request){const matches=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));return matches.length===1?matches[0].slice(cookieName.length+1):'';}
async function boundedJson(request:Request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing body');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2048)throw Error('Body bound');chunks.push(part.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!record(value))throw Error('Invalid body');return value;
}
/** Opt-in browser cookie bridge for fabricated fixtures only. No Source fallback. */
export async function handleNativeAuthPreview(request:Request,operation:string,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):Promise<Response>{
 if(env.PMRFP_NATIVE_AUTH_PREVIEW!=='synthetic-only'||!(env.VERCEL_ENV==='preview'||(!env.VERCEL_ENV&&env.NODE_ENV==='development')))return failure('native_preview_not_enabled',503);
 if(!env.PMRFP_NATIVE_AUTH_GATEWAY_SECRET||env.PMRFP_NATIVE_AUTH_GATEWAY_SECRET.length<32)return failure('native_preview_unavailable',503);
 if(!['sign-up','sign-in','session','sign-out','saved-rfps','profile'].includes(operation)||new URL(request.url).search)return failure('not_found',404);
 const signupIntent = env.PMRFP_NATIVE_PROFILE_PREVIEW === 'signup-intent';
 if(operation==='sign-up'&&!signupIntent)return failure('not_found',404);
 if(operation==='profile'&&!signupIntent&&env.PMRFP_NATIVE_PROFILE_PREVIEW!=='enabled')return failure('not_found',404);
 if(operation==='saved-rfps'?!['GET','POST'].includes(request.method):operation==='session'?request.method!=='GET':request.method!=='POST')return failure('invalid_request',400);
 let body:Record<string,unknown>|undefined;
 if(request.method==='POST'){
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return failure('invalid_request',400);
  try{body=await boundedJson(request);
   if(operation==='saved-rfps')body={...parseSaveInput(body)};
   else if(operation==='sign-up'){
    const input = previewSignupSchema.parse(body);
    if (!/^[-a-z0-9]+@example\.invalid$/.test(input.email) || !input.fullName || !input.password || Buffer.byteLength(input.password)>72) {
     throw Error('Invalid fixture signup');
    }
    body = { email: input.email, name: input.fullName, password: input.password, role: input.role, lang: input.lang };
   }
   else if(operation==='profile'&&!signupIntent)body=signupProfileSchema.parse(body);
   else if(operation==='sign-in'?typeof body.email!=='string'||!/^[-a-z0-9]+@example\.invalid$/.test(body.email)||typeof body.password!=='string'||Buffer.byteLength(body.password)>72||Object.keys(body).some(k=>!['email','password'].includes(k)):Object.keys(body).length!==0)throw Error('Unexpected input');
  }catch{return failure('invalid_request',400);}
 }
 if(operation==='sign-up'){
  const trackingDisabled = optedOut(request.headers);
  const firstTouchCookie = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim())
   .find(value => value.startsWith(FT_COOKIE + '='));
  const firstTouch = trackingDisabled ? null : parseFirstTouch(firstTouchCookie?.slice(FT_COOKIE.length + 1));
  try {
   const response = await fetcher(origin+'/api/auth/sign-up/email', {
    method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12000),
    headers: {
     origin, 'content-type': 'application/json', 'x-pmrfp-auth-preview-key': env.PMRFP_NATIVE_AUTH_GATEWAY_SECRET,
     ...(trackingDisabled ? { dnt: '1' } : {}),
     ...(firstTouch ? { 'x-pmrfp-signup-first-touch': serializeFirstTouch(firstTouch) } : {}),
    },
    body: JSON.stringify(body),
   });
   if(response.status!==200)return failure('native_signup_unavailable',response.status===400?400:503);
   return Response.json({ok:true},{headers});
  } catch { return failure('native_signup_unavailable',503); }
 }
 const cookies=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));
 const sessionToken=cookies.length===1?cookies[0].slice(cookieName.length+1):'';
 if(operation==='sign-out'&&cookies.length>0&&!nativePreviewTokenPattern.test(sessionToken))return failure('sign_in_required',401);
 if(['session','saved-rfps','profile'].includes(operation)&&!nativePreviewTokenPattern.test(sessionToken))return failure('sign_in_required',401);
 if(operation==='saved-rfps'||operation==='profile'){
  if(!env.PMRFP_NATIVE_APP_GATEWAY_SECRET||env.PMRFP_NATIVE_APP_GATEWAY_SECRET.length<32)return failure('native_preview_unavailable',503);
  try{
   const endpoint = operation === 'profile' ? '/v1/profile' : '/v1/saved-rfps';
   const response=await fetcher('https://pmrfp-native-auth-app-sandbox.pmrfp.workers.dev'+endpoint,{method:request.method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'x-pmrfp-gateway-key':env.PMRFP_NATIVE_APP_GATEWAY_SECRET,'x-pmrfp-native-session':'__Secure-better-auth.session_token='+sessionToken,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(!response.ok){
    const denied = [400,401,403,404].includes(response.status) || (operation === 'profile' && response.status === 409);
    return failure('native_operation_denied', denied ? response.status : 503);
   }
   const value:unknown=await response.json();if(!record(value))throw Error('Invalid native response');
   if(operation==='profile'){
    if(typeof value.created!=='boolean'||response.status!==(value.created?201:200))throw Error('Invalid profile response');
    return Response.json({created:value.created},{status:response.status,headers});
   }
   if(body){if(value.ok!==true)throw Error('Invalid write response');return Response.json({ok:true},{headers});}
   if(!Array.isArray(value.items)||value.items.length>500)throw Error('Invalid saved list');
   const items=value.items.map(row=>{if(!record(row)||typeof row.rfpId!=='string'||!UUID.test(row.rfpId)||typeof row.title!=='string'||typeof row.slug!=='string'||typeof row.savedAt!=='string')throw Error('Invalid saved item');return {rfpId:row.rfpId,title:row.title,slug:row.slug,savedAt:row.savedAt};});
   return Response.json({items},{headers});
  }catch{return failure('native_preview_unavailable',503);}
 }
 const endpoint=operation==='sign-in'?'sign-in/email':operation==='session'?'get-session':'sign-out';
 try{
  const response=await fetcher(origin+'/api/auth/'+endpoint,{method:request.method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'x-pmrfp-auth-preview-key':env.PMRFP_NATIVE_AUTH_GATEWAY_SECRET,...(body?{origin,'content-type':'application/json'}:{}),...(nativePreviewTokenPattern.test(sessionToken)?{cookie:'__Secure-better-auth.session_token='+sessionToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)return failure(response.status===401||response.status===403?'sign_in_required':'native_preview_unavailable',response.status===401||response.status===403?401:503);
  const value:unknown=await response.json();
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  if(operation==='sign-out')return Response.json({ok:true},{headers:{...headers,'set-cookie':`${cookieName}=; Path=/api/migration/native-auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`}});
  if(!record(value)||!record(value.user)||typeof value.user.id!=='string'||!/^00000000-0000-4000-8000-0000000000[0-9]{2}$/.test(value.user.id)||typeof value.user.email!=='string'||!/^[-a-z0-9]+@example\.invalid$/.test(value.user.email)||value.user.emailVerified!==true||(value.user.banned!==false&&!(value.user.banned===true&&typeof value.user.banExpires==='string'&&Date.parse(value.user.banExpires)<=Date.now())))return failure('sign_in_required',401);
  const result=Response.json({user:{id:value.user.id,email:value.user.email}},{headers});
  if(operation==='sign-in'){
   const upstream=response.headers.getSetCookie().filter(x=>x.startsWith('__Secure-better-auth.session_token='));
   if(upstream.length!==1)return failure('native_preview_unavailable',503);
   const token=upstream[0].split(';')[0].slice('__Secure-better-auth.session_token='.length);if(!nativePreviewTokenPattern.test(token))return failure('native_preview_unavailable',503);
   result.headers.set('set-cookie',`${cookieName}=${token}; Path=/api/migration/native-auth; HttpOnly; SameSite=Lax; Max-Age=900${secure}`);
  }else if(!record(value.session)||value.session.userId!==value.user.id||typeof value.session.expiresAt!=='string'||!Number.isFinite(Date.parse(value.session.expiresAt))||Date.parse(value.session.expiresAt)<=Date.now())return failure('sign_in_required',401);
  return result;
 }catch{return failure('native_preview_unavailable',503);}
}
