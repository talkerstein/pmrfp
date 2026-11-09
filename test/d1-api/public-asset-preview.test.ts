import {createHash} from 'node:crypto';import {expect,it,vi} from 'vitest';
import {publicAssetId,publicAssetPreviewRedirect} from '../../src/lib/d1/public-asset-preview';
const source='https://tumexryzbzmtijvbloch.supabase.co/storage/v1/object/public/';
const id='a'.repeat(64),signature='b'.repeat(64),origin='https://pmrfp-verified-public-assets-preview.pmrfp.workers.dev';
const env={VERCEL_ENV:'preview',PMRFP_PUBLIC_ASSET_PREVIEW:'enabled',PMRFP_PUBLIC_ASSET_GATEWAY_SECRET:'private-gateway-0000000000000000'};
const request=()=>new Request('https://app.invalid/api/migration/public-asset/'+id,{headers:{cookie:'SOURCE_MUST_NOT_FORWARD'}});
it('maps only original public logo and listing image URLs',()=>{
 expect(publicAssetId(source+'logos/a%20b.png')).toBe(createHash('sha256').update('logos/a b.png').digest('hex'));
 for(const value of [source+'project-photos-private/a.jpg',source+'logos/a%2Fb.jpg',source+'logos/a.jpg?token=private',source.replace('supabase.co','other.invalid')+'logos/a.jpg'])expect(publicAssetId(value)).toBeNull();
});
it('redirects to the exact short-lived worker asset and sends no Source cookie upstream',async()=>{
 const expiry=Math.floor(Date.now()/1000)+90;const url=`${origin}/v1/assets/${id}?exp=${expiry}&sig=${signature}`;
 const fetcher=vi.fn<typeof fetch>(async(target,init)=>{expect(target).toBe(`${origin}/v1/assets/${id}/link`);expect(init?.method).toBe('POST');expect(JSON.stringify(init)).not.toContain('SOURCE_MUST_NOT_FORWARD');return Response.json({url});});
 const response=await publicAssetPreviewRedirect(request(),id,env,fetcher);expect(response.status).toBe(307);expect(response.headers.get('location')).toBe(url);expect(response.headers.get('referrer-policy')).toBe('no-referrer');expect(await response.text()).toBe('');
});
it('refuses production, malformed selectors, expired capabilities and redirect substitution',async()=>{
 const fetcher=vi.fn<typeof fetch>();expect((await publicAssetPreviewRedirect(request(),id,{...env,VERCEL_ENV:'production'},fetcher)).status).toBe(404);expect((await publicAssetPreviewRedirect(request(),'../private',env,fetcher)).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 for(const url of [`https://other.invalid/v1/assets/${id}?exp=9999999999&sig=${signature}`,`${origin}/v1/assets/${id}?exp=1000000000&sig=${signature}`,`${origin}/v1/assets/${'c'.repeat(64)}?exp=9999999999&sig=${signature}`])expect((await publicAssetPreviewRedirect(request(),id,env,async()=>Response.json({url}))).status).toBe(503);
});
