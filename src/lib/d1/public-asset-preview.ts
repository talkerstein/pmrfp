import {createHash} from 'node:crypto';
const sourceOrigin='https://tumexryzbzmtijvbloch.supabase.co';
const assetOrigin='https://pmrfp-verified-public-assets-preview.pmrfp.workers.dev';
const hex64=/^[a-f0-9]{64}$/;
const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const deny=(status:number)=>new Response(null,{status,headers});

/** Map only the two approved public Source image namespaces to opaque IDs. */
export function publicAssetId(source:string):string|null{
 try{
  const url=new URL(source);if(url.origin!==sourceOrigin||url.username||url.password||url.search||url.hash)return null;
  const match=/^\/storage\/v1\/object\/public\/((?:logos|rfp-photos)\/.+)$/.exec(url.pathname);if(!match)return null;
  const parts=match[1].split('/').map(decodeURIComponent);
  if(parts.some(p=>!p||p==='.'||p==='..'||/[\/\\\x00-\x1f]/.test(p)))return null;
  return createHash('sha256').update(parts.join('/')).digest('hex');
 }catch{return null;}
}

/** Existing listing pages opt in only for the images copied to this preview. */
export function publicRfpPhotoSource(
 source:string,env:Record<string,string|undefined>=process.env,
):{src:string;unoptimized?:true}{
 if(env.VERCEL_ENV!=='preview'||env.PMRFP_PUBLIC_ASSET_PREVIEW!=='enabled')return {src:source};
 const allowlist=env.PMRFP_PUBLIC_RFP_ASSET_IDS;
 if(!allowlist||allowlist.length>6500)return {src:source};
 const ids=allowlist.split(',');
 if(!ids.every(id=>hex64.test(id)))return {src:source};
 const id=publicAssetId(source);
 return id&&ids.includes(id)?{src:`/api/migration/public-asset/${id}`,unoptimized:true}:{src:source};
}

/** Private Vercel Preview can mint a browser link; binary bytes bypass Vercel. */
export async function publicAssetPreviewRedirect(request:Request,id:string,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):Promise<Response>{
 if(env.VERCEL_ENV!=='preview'||env.PMRFP_PUBLIC_ASSET_PREVIEW!=='enabled')return deny(404);
 if(request.method!=='GET'||!hex64.test(id)||new URL(request.url).search)return deny(400);
 const key=env.PMRFP_PUBLIC_ASSET_GATEWAY_SECRET;if(!key||key.length<32||key.length>512)return deny(503);
 try{
  const upstream=await fetcher(`${assetOrigin}/v1/assets/${id}/link`,{method:'POST',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{'x-pmrfp-asset-preview-key':key}});
  if(!upstream.ok)return deny(upstream.status===404?404:503);
  const data:unknown=await upstream.json();if(!data||typeof data!=='object'||!('url' in data)||typeof data.url!=='string'||data.url.length>512)return deny(503);
  const url=new URL(data.url),expiry=url.searchParams.get('exp'),signature=url.searchParams.get('sig'),now=Math.floor(Date.now()/1000);
  if(url.origin!==assetOrigin||url.pathname!==`/v1/assets/${id}`||url.username||url.password||url.hash||[...url.searchParams.keys()].length!==2||!expiry||!/^\d{10}$/.test(expiry)||Number(expiry)<=now||Number(expiry)>now+120||!signature||!hex64.test(signature))return deny(503);
  return new Response(null,{status:307,headers:{...headers,location:url.href}});
 }catch{return deny(503);}
}
