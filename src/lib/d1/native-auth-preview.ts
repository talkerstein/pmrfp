const origin='https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev';
const cookieName='pmrfp-native-preview';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const failure=(error:string,status:number)=>Response.json({error},{status,headers});
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const tokenPattern=/^(?:[A-Za-z0-9._~-]|%[a-fA-F0-9]{2}){16,4096}$/;
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
 if(!['sign-in','session','sign-out'].includes(operation)||new URL(request.url).search)return failure('not_found',404);
 if(operation==='session'?request.method!=='GET':request.method!=='POST')return failure('invalid_request',400);
 let body:Record<string,unknown>|undefined;
 if(request.method==='POST'){
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return failure('invalid_request',400);
  try{body=await boundedJson(request);
   if(operation==='sign-in'?typeof body.email!=='string'||!/^[-a-z0-9]+@example\.invalid$/.test(body.email)||typeof body.password!=='string'||Buffer.byteLength(body.password)>72||Object.keys(body).some(k=>!['email','password'].includes(k)):Object.keys(body).length!==0)throw Error('Unexpected input');
  }catch{return failure('invalid_request',400);}
 }
 const cookies=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));
 const sessionToken=cookies.length===1?cookies[0].slice(cookieName.length+1):'';
 if(operation==='session'&&!tokenPattern.test(sessionToken))return failure('sign_in_required',401);
 const endpoint=operation==='sign-in'?'sign-in/email':operation==='session'?'get-session':'sign-out';
 try{
  const response=await fetcher(origin+'/api/auth/'+endpoint,{method:request.method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'x-pmrfp-auth-preview-key':env.PMRFP_NATIVE_AUTH_GATEWAY_SECRET,...(body?{origin,'content-type':'application/json'}:{}),...(tokenPattern.test(sessionToken)?{cookie:'__Secure-better-auth.session_token='+sessionToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)return failure(response.status===401||response.status===403?'sign_in_required':'native_preview_unavailable',response.status===401||response.status===403?401:503);
  const value:unknown=await response.json();
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  if(operation==='sign-out')return Response.json({ok:true},{headers:{...headers,'set-cookie':`${cookieName}=; Path=/api/migration/native-auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`}});
  if(!record(value)||!record(value.user)||typeof value.user.id!=='string'||!/^00000000-0000-4000-8000-0000000000[0-9]{2}$/.test(value.user.id)||typeof value.user.email!=='string'||!/^[-a-z0-9]+@example\.invalid$/.test(value.user.email)||value.user.emailVerified!==true||(value.user.banned!==false&&!(value.user.banned===true&&typeof value.user.banExpires==='string'&&Date.parse(value.user.banExpires)<=Date.now())))return failure('sign_in_required',401);
  const result=Response.json({user:{id:value.user.id,email:value.user.email}},{headers});
  if(operation==='sign-in'){
   const upstream=response.headers.getSetCookie().filter(x=>x.startsWith('__Secure-better-auth.session_token='));
   if(upstream.length!==1)return failure('native_preview_unavailable',503);
   const token=upstream[0].split(';')[0].slice('__Secure-better-auth.session_token='.length);if(!tokenPattern.test(token))return failure('native_preview_unavailable',503);
   result.headers.set('set-cookie',`${cookieName}=${token}; Path=/api/migration/native-auth; HttpOnly; SameSite=Lax; Max-Age=900${secure}`);
  }else if(!record(value.session)||value.session.userId!==value.user.id||typeof value.session.expiresAt!=='string'||!Number.isFinite(Date.parse(value.session.expiresAt))||Date.parse(value.session.expiresAt)<=Date.now())return failure('sign_in_required',401);
  return result;
 }catch{return failure('native_preview_unavailable',503);}
}
