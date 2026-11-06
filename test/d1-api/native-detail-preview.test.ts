import {it,expect,vi} from 'vitest';import {handleNativeDetailPreview} from '../../src/lib/d1/native-detail-preview';
import {DETAIL_TEXT,DETAIL_IDS,SYNTHETIC_DETAIL_DATASET} from '../../src/lib/d1/detail-contracts';
const env={VERCEL_ENV:'preview',PMRFP_NATIVE_AUTH_PREVIEW:'synthetic-only',PMRFP_NATIVE_APP_GATEWAY_SECRET:'synthetic-app-key-at-least-32-characters'};
const token='synthetic-signed-session-token-0001',request=()=>new Request('https://preview.invalid/api/migration/native-auth/rfp-detail/private-test',{headers:{cookie:'source-cookie=MUST_NOT_FORWARD; pmrfp-native-preview='+token}});
it('keeps production/customer selection disabled and requires a signed native cookie before transport',async()=>{
 const fetcher=vi.fn();expect((await handleNativeDetailPreview(request(),'private-test',{...env,VERCEL_ENV:'production'},fetcher)).status).toBe(503);expect((await handleNativeDetailPreview(new Request(request().url),'private-test',env,fetcher)).status).toBe(401);expect((await handleNativeDetailPreview(request(),'../customer',env,fetcher)).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
});
it('pins the fictional authority, strips server-only fields and never forwards Source cookies',async()=>{
 const row={...Object.fromEntries([...DETAIL_TEXT,...DETAIL_IDS].map(k=>[k,null])),id:'10000000-0000-4000-8000-000000000001',slug:'private-test',title:'Fake',status:'published',contact_visibility:'public_contact',is_demo:false,budget_public:false,budget_min:null,budget_max:null,scope:'PRIVATE_FAKE_SCOPE',keep_alive_token:'MUST_NOT_EXPOSE'};
 const response=await handleNativeDetailPreview(request(),'private-test',env,async(url,options)=>{expect(String(url)).toBe('https://pmrfp-native-auth-app-sandbox.pmrfp.workers.dev/v1/rfp-detail?slug=private-test');expect(JSON.stringify(options)).not.toContain('source-cookie');expect(options?.headers).toMatchObject({'x-pmrfp-native-session':'__Secure-better-auth.session_token='+token});return Response.json({dataset:SYNTHETIC_DETAIL_DATASET,item:row});});expect(response.status).toBe(200);const text=await response.text();expect(text).toContain('PRIVATE_FAKE_SCOPE');expect(text).not.toContain('MUST_NOT_EXPOSE');expect(response.headers.get('cache-control')).toBe('private, no-store');
 const wrong=await handleNativeDetailPreview(request(),'private-test',env,async()=>Response.json({dataset:'a'.repeat(64),item:row}));expect(wrong.status).toBe(503);expect(await wrong.text()).not.toContain('PRIVATE_FAKE_SCOPE');
});
it('passes a permission-filtered empty result and hides upstream diagnostics on denial',async()=>{
 const empty=await handleNativeDetailPreview(request(),'private-test',env,async()=>Response.json({dataset:SYNTHETIC_DETAIL_DATASET,item:null}));expect((await empty.json()).item).toBeNull();
 const rejected=await handleNativeDetailPreview(request(),'private-test',env,async()=>Response.json({error:'PRIVATE_SQL_DETAIL'},{status:403}));expect(rejected.status).toBe(403);expect(await rejected.text()).not.toContain('PRIVATE_SQL');
});
