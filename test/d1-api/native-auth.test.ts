import {expect,it,vi} from 'vitest';
import {verifyUser,type AuthConfig} from '../../workers/d1-api/auth';
import {verifyNativeSyntheticUser} from '../../workers/d1-api/native-auth';
const id='00000000-0000-4000-8000-000000000001',origin='https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev';
const env:AuthConfig={AUTH_PROVIDER:'native-synthetic',NATIVE_AUTH_URL:origin,NATIVE_AUTH_GATEWAY_SECRET:'synthetic-auth-gateway-at-least-32-characters',SUPABASE_URL:'https://must-not-call.supabase.co',SUPABASE_ANON_KEY:'unused'};
const cookie='__Secure-better-auth.session_token=synthetic.signed%2Fcookie';
const request=(value=cookie)=>new Request('https://api.invalid/v1/saved-rfps',{headers:{'x-pmrfp-native-session':value,authorization:'Bearer must.not.forward'}});
const body=()=>({user:{id,email:'test@example.invalid',emailVerified:true,banned:false,role:'super_admin'},session:{userId:id,expiresAt:'2099-01-01T00:00:00Z'}});
it('verifies the native live session without Source auth, metadata roles or unrelated headers',async()=>{
 const fetcher=vi.fn<typeof fetch>(async(url,options)=>{expect(String(url)).toBe(origin+'/api/auth/get-session');const headers=new Headers(options?.headers);expect(headers.get('cookie')).toBe(cookie);expect(headers.get('authorization')).toBeNull();expect(headers.get('x-pmrfp-auth-preview-key')).toBe(env.NATIVE_AUTH_GATEWAY_SECRET);expect(options?.cache).toBe('no-store');expect(options?.redirect).toBe('manual');return Response.json(body());});
 expect(await verifyUser(request(),env,fetcher)).toBe(id);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects missing, injected and malformed cookies before any network request',async()=>{
 const fetcher=vi.fn<typeof fetch>();
 for(const value of ['',cookie+'; unrelated=secret','session_token=unsigned',cookie+'%ZZ','x'.repeat(4097)])await expect(verifyNativeSyntheticUser(request(value),env,fetcher)).rejects.toMatchObject({status:401});
 expect(fetcher).not.toHaveBeenCalled();
});
it('rejects revoked, expired, wrong-identity, non-synthetic, unverified and banned sessions',async()=>{
 const variants:unknown[]=[null,{...body(),session:{...body().session,expiresAt:'2000-01-01T00:00:00Z'}},{...body(),session:{...body().session,userId:'another'}},{...body(),user:{...body().user,id:'10000000-0000-4000-8000-000000000001'}},{...body(),user:{...body().user,email:'real@example.com'}},{...body(),user:{...body().user,emailVerified:false}},{...body(),user:{...body().user,banned:true,banExpires:null}},{...body(),user:{...body().user,banned:true,banExpires:'2099-01-01T00:00:00Z'}}];
 for(const value of variants)await expect(verifyUser(request(),env,async()=>Response.json(value))).rejects.toMatchObject({status:401});
 expect(await verifyUser(request(),env,async()=>Response.json({...body(),user:{...body().user,banned:true,banExpires:'2020-01-01T00:00:00Z'}}))).toBe(id);
});
it('never falls back to Source when native configuration or service fails',async()=>{
 for(const config of [{...env,NATIVE_AUTH_URL:'https://evil.invalid'},{...env,NATIVE_AUTH_GATEWAY_SECRET:'short'},{...env,AUTH_PROVIDER:'unknown'}])await expect(verifyUser(request(),config as AuthConfig,vi.fn())).rejects.toMatchObject({status:503});
 for(const status of [302,500])await expect(verifyUser(request(),env,async()=>new Response(null,{status}))).rejects.toMatchObject({status:503});
 await expect(verifyUser(request(),env,async()=>{throw Error('SENSITIVE_NETWORK_DETAIL');})).rejects.toMatchObject({status:503,code:'native_auth_service_unavailable'});
});
it('native Auth cannot open copied datasets or the Source-dependent private detail endpoint',async()=>{
 const {handleRequest}=await import('../../workers/d1-api');const fetcher=vi.fn<typeof fetch>();
 const db={prepare:()=>({first:async()=>null})};
 const config={...env,DB:db,GATEWAY_SECRET:'synthetic-api-gateway-at-least-32-characters',SAVED_RFPS_MODE:'sandbox-write'};
 const headers={'x-pmrfp-gateway-key':config.GATEWAY_SECRET,'x-pmrfp-native-session':cookie};
 const saved=await handleRequest(new Request('https://api.invalid/v1/saved-rfps',{headers}),config as never,fetcher);expect(saved.status).toBe(503);
 const detail=await handleRequest(new Request('https://api.invalid/v1/rfp-detail?slug=test',{headers}),config as never,fetcher);expect(detail.status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
});
it('uses the explicit private service binding without a public fetch when available',async()=>{
 const service=vi.fn<typeof fetch>(async()=>Response.json(body()));const external=vi.fn<typeof fetch>();
 expect(await verifyUser(request(),{...env,NATIVE_AUTH_SERVICE:{fetch:service}},external)).toBe(id);
 expect(service).toHaveBeenCalledTimes(1);expect(external).not.toHaveBeenCalled();
});
