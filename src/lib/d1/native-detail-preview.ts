import {RFP_SLUG} from './contracts';
import {nativePreviewCookie,nativePreviewTokenPattern} from './native-auth-preview';
import {detailRow,SYNTHETIC_DETAIL_DATASET} from './detail-contracts';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const denied=(error:string,status:number)=>Response.json({error},{status,headers});
/** Existing synthetic app authority only; no Source token, SQL or caller user id. */
export async function handleNativeDetailPreview(request:Request,slug:string,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):Promise<Response>{
 if(env.PMRFP_NATIVE_AUTH_PREVIEW!=='synthetic-only'||!(env.VERCEL_ENV==='preview'||(!env.VERCEL_ENV&&env.NODE_ENV==='development'))||!env.PMRFP_NATIVE_APP_GATEWAY_SECRET||env.PMRFP_NATIVE_APP_GATEWAY_SECRET.length<32)return denied('native_preview_not_enabled',503);
 if(request.method!=='GET'||!RFP_SLUG.test(slug)||new URL(request.url).search)return denied('invalid_request',400);
 const token=nativePreviewCookie(request);if(!nativePreviewTokenPattern.test(token))return denied('sign_in_required',401);
 try{
  const response=await fetcher('https://pmrfp-native-auth-app-sandbox.pmrfp.workers.dev/v1/rfp-detail?slug='+encodeURIComponent(slug),{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'x-pmrfp-gateway-key':env.PMRFP_NATIVE_APP_GATEWAY_SECRET,'x-pmrfp-native-session':'__Secure-better-auth.session_token='+token}});
  if(!response.ok)return denied('native_detail_denied',[400,401,403,404,409].includes(response.status)?response.status:503);
  const value:unknown=await response.json();if(!value||typeof value!=='object'||!('dataset' in value)||value.dataset!==SYNTHETIC_DETAIL_DATASET||!('item' in value))throw Error('Unexpected detail authority');
  return Response.json({dataset:SYNTHETIC_DETAIL_DATASET,item:value.item===null?null:detailRow(value.item)},{headers});
 }catch{return denied('native_preview_unavailable',503);}
}
