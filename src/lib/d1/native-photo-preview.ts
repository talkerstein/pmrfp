import {processPhoto,UnreadableImageError} from '../projects/image';
import {UUID} from './contracts';
import {nativePreviewCookie,nativePreviewTokenPattern} from './native-auth-preview';
// Stay below Vercel's 4.5 MB function payload limit; full-size uploads need a direct Worker path.
const maxBytes=4*1024*1024;
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"};
const denied=(error:string,status:number)=>Response.json({error},{status,headers});
/** Isolated existing synthetic R2 sandbox only; not the real-file archive. */
export async function handleNativePhotoPreview(request:Request,projectId:string,photoId:string,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):Promise<Response>{
 if(env.PMRFP_NATIVE_AUTH_PREVIEW!=='synthetic-only'||!(env.VERCEL_ENV==='preview'||(!env.VERCEL_ENV&&env.NODE_ENV==='development'))||!env.PMRFP_NATIVE_APP_GATEWAY_SECRET||env.PMRFP_NATIVE_APP_GATEWAY_SECRET.length<32)return denied('native_preview_not_enabled',503);
 if(!UUID.test(projectId)||!photoId.endsWith('.jpg')||!UUID.test(photoId.slice(0,-4))||new URL(request.url).search||request.headers.has('range')||!['GET','HEAD','PUT','DELETE'].includes(request.method))return denied('invalid_request',400);
 const token=nativePreviewCookie(request);if(!nativePreviewTokenPattern.test(token))return denied('sign_in_required',401);
 if(['PUT','DELETE'].includes(request.method)&&request.headers.get('origin')!==new URL(request.url).origin)return denied('invalid_request',400);
 let bytes:Uint8Array<ArrayBuffer>|undefined;let dimensions:{width:number;height:number}|undefined;
 if(request.method==='PUT'){
  if(request.headers.get('content-type')!=='image/jpeg')return denied('jpeg_required',415);
  const reader=request.body?.getReader();if(!reader)return denied('invalid_request',400);
  const chunks:Uint8Array[]=[];let size=0;
  try{try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes)return denied('request_too_large',413);chunks.push(part.value);}}finally{await reader.cancel();}
   if(size<3)return denied('invalid_request',400);bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  }catch{return denied('invalid_request',400);}
  try{const processed=await processPhoto(Buffer.from(bytes));bytes=new Uint8Array(processed.data);dimensions={width:processed.width,height:processed.height};}
  catch(error){return denied(error instanceof UnreadableImageError?'unreadable_image':'image_processing_unavailable',error instanceof UnreadableImageError?422:503);}
 }
 try{
  const response=await fetcher('https://pmrfp-native-auth-app-sandbox.pmrfp.workers.dev/v1/project-photos/'+projectId+'/'+photoId,{method:request.method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'x-pmrfp-gateway-key':env.PMRFP_NATIVE_APP_GATEWAY_SECRET,'x-pmrfp-native-session':'__Secure-better-auth.session_token='+token,...(bytes?{'content-type':'image/jpeg'}:{})},...(bytes?{body:bytes.buffer}:{})});
  if(!response.ok)return denied('native_photo_denied',[400,401,403,404,409,413,415,416].includes(response.status)?response.status:503);
  if(request.method==='DELETE'){if(response.status!==204)throw Error('Invalid delete response');return new Response(null,{status:204,headers});}
  if(request.method==='PUT')return Response.json({ok:true,...dimensions},{headers});
  if(response.headers.get('content-type')!=='image/jpeg')throw Error('Invalid image response');
  const length=response.headers.get('content-length');if(!length||!/^\d+$/.test(length)||Number(length)>maxBytes)return denied('photo_exceeds_preview_limit',413);
  const resultHeaders=new Headers({...headers,'content-type':'image/jpeg','content-length':length});
  return new Response(request.method==='HEAD'?null:response.body,{status:200,headers:resultHeaders});
 }catch{return denied('native_preview_unavailable',503);}
}
