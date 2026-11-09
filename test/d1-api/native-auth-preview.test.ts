import {it,expect,vi} from 'vitest';
import {handleNativeAuthPreview} from '../../src/lib/d1/native-auth-preview';
const origin='https://preview.invalid',gateway='synthetic-gateway-key-at-least-32-characters';
const env={VERCEL_ENV:'preview',PMRFP_NATIVE_AUTH_PREVIEW:'synthetic-only',PMRFP_NATIVE_AUTH_GATEWAY_SECRET:gateway};
const user={id:'00000000-0000-4000-8000-000000000011',email:'fixture@example.invalid',emailVerified:true,banned:false};
const token='synthetic-signed-token-value-0001';
const request=(operation:string,body?:unknown,headers:Record<string,string>={})=>new Request(origin+'/api/migration/native-auth/'+operation,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
it("requires a same-origin preview session and returns only the profile creation outcome", async () => {
 const config = { ...env, PMRFP_NATIVE_APP_GATEWAY_SECRET: gateway, PMRFP_NATIVE_PROFILE_PREVIEW: "enabled" };
 const cookie = "other=MUST_NOT_FORWARD; pmrfp-native-preview=" + token;
 const fetcher = vi.fn<typeof fetch>(async (url, init) => {
  expect(url).toBe("https://pmrfp-native-auth-app-sandbox.pmrfp.workers.dev/v1/profile");
  expect(new Headers(init?.headers).get("x-pmrfp-native-session")).toBe("__Secure-better-auth.session_token=" + token);
  expect(JSON.stringify(init)).not.toContain("MUST_NOT_FORWARD");
  expect(init?.body).toBe(JSON.stringify({ fullName: "Fixture", role: "trade" }));
  return Response.json({ created: true, privateValue: "MUST_NOT_RETURN" }, { status: 201 });
 });
 const body = { fullName: " Fixture ", role: "trade" };
 expect((await handleNativeAuthPreview(request("profile", body, { cookie }), "profile", env, fetcher)).status).toBe(404);
 expect((await handleNativeAuthPreview(request("profile", body), "profile", config, fetcher)).status).toBe(401);
 expect((await handleNativeAuthPreview(request("profile", body, { cookie, origin: "https://other.invalid" }), "profile", config, fetcher)).status).toBe(400);
 expect(fetcher).not.toHaveBeenCalled();
 const response = await handleNativeAuthPreview(request("profile", body, { cookie }), "profile", config, fetcher);
 expect(response.status).toBe(201);
 expect(await response.json()).toEqual({ created: true });
});
it('fails closed outside explicit Preview and before any private transport',async()=>{
 const fetcher=vi.fn();for(const config of [{...env,VERCEL_ENV:'production'},{...env,VERCEL_ENV:'production',NODE_ENV:'development'},{...env,PMRFP_NATIVE_AUTH_PREVIEW:''},{...env,PMRFP_NATIVE_AUTH_GATEWAY_SECRET:''}])expect((await handleNativeAuthPreview(request('session'),'session',config,fetcher)).status).toBe(503);
 expect(fetcher).not.toHaveBeenCalled();
});
it('requires same-origin JSON and fixture credentials; never accepts customer login or caller-selected paths',async()=>{
 const fetcher=vi.fn();
 for(const req of [request('sign-in',{email:user.email,password:'synthetic-password'},{origin:'https://evil.invalid'}),request('sign-in',{email:'customer@example.com',password:'synthetic-password'}),request('sign-in',{email:user.email,password:'é'.repeat(37)}),request('sign-in',{email:user.email,password:'synthetic-password',callbackURL:'https://evil.invalid'})])expect((await handleNativeAuthPreview(req,'sign-in',env,fetcher)).status).toBe(400);
 expect((await handleNativeAuthPreview(request('admin'),'admin',env,fetcher)).status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
});
it('turns a signed fixture session into an HttpOnly bounded cookie without exposing tokens',async()=>{
 const fetcher=vi.fn(async(url,init)=>{expect(url).toBe('https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev/api/auth/sign-in/email');expect(init.headers).toMatchObject({'x-pmrfp-auth-preview-key':gateway,origin:'https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev'});expect(init.redirect).toBe('manual');return Response.json({user,token:'MUST_NOT_EXPOSE'},{headers:{'set-cookie':'__Secure-better-auth.session_token='+token+'; Path=/; HttpOnly; Secure'}});});
 const response=await handleNativeAuthPreview(request('sign-in',{email:user.email,password:'synthetic-password'}),'sign-in',env,fetcher as typeof fetch);
 expect(response.status).toBe(200);expect(await response.json()).toEqual({user:{id:user.id,email:user.email}});expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax; Max-Age=900; Secure');expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('forwards only the preview session and rejects stale/banned/foreign identity responses',async()=>{
 const req=()=>request('session',undefined,{cookie:'source-cookie=MUST_NOT_FORWARD; pmrfp-native-preview='+token});
 for(const value of [null,{user:{...user,id:'real-user'},session:{}},{user:{...user,banned:true,banExpires:'2099-01-01T00:00:00Z'},session:{}},{user,session:{userId:user.id,expiresAt:'2000-01-01T00:00:00Z'}}])expect((await handleNativeAuthPreview(req(),'session',env,async()=>Response.json(value))).status).toBe(401);
 const response=await handleNativeAuthPreview(req(),'session',env,async(_url,init)=>{expect(init?.headers).toMatchObject({cookie:'__Secure-better-auth.session_token='+token});expect(JSON.stringify(init)).not.toContain('MUST_NOT_FORWARD');return Response.json({user,session:{userId:user.id,expiresAt:new Date(Date.now()+600000).toISOString(),token:'MUST_NOT_EXPOSE'}});});expect(await response.json()).toEqual({user:{id:user.id,email:user.email}});
});
it('logout revokes upstream and clears the dedicated cookie; failures never fall back or expose diagnostics',async()=>{
 const req=()=>request('sign-out',{}, {cookie:'pmrfp-native-preview='+token});
 const response=await handleNativeAuthPreview(req(),'sign-out',env,async()=>Response.json({success:true}));expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
 const denied=await handleNativeAuthPreview(req(),'sign-out',env,async()=>{throw Error('SENSITIVE_PROVIDER_DETAIL');});expect(denied.status).toBe(503);expect(await denied.text()).not.toContain('SENSITIVE');
});
it('uses only signed cookie identity for native saved-list reads/writes; rejects caller identities and respects worker denials',async()=>{
 const config={...env,PMRFP_NATIVE_APP_GATEWAY_SECRET:gateway};
 const req=(body?:unknown)=>request('saved-rfps',body,{cookie:'source-cookie=MUST_NOT_FORWARD; pmrfp-native-preview='+token});
 const read=await handleNativeAuthPreview(req(),'saved-rfps',config,async(url,init)=>{expect(url).toBe('https://pmrfp-native-auth-app-sandbox.pmrfp.workers.dev/v1/saved-rfps');expect(init?.headers).toMatchObject({'x-pmrfp-native-session':'__Secure-better-auth.session_token='+token,'x-pmrfp-gateway-key':gateway});expect(JSON.stringify(init)).not.toContain('source-cookie');return Response.json({items:[]});});expect(await read.json()).toEqual({items:[]});
 const fetcher=vi.fn(async()=>Response.json({ok:true}));expect((await handleNativeAuthPreview(req({rfpId:user.id,action:'save'}),'saved-rfps',config,fetcher as typeof fetch)).status).toBe(200);
 expect((await handleNativeAuthPreview(req({rfpId:user.id,action:'save',userId:'customer'}),'saved-rfps',config,fetcher as typeof fetch)).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(1);
 const denied=await handleNativeAuthPreview(req(),'saved-rfps',config,async()=>Response.json({error:'PRIVATE_SQL_DETAIL'},{status:403}));expect(denied.status).toBe(403);expect(await denied.text()).not.toContain('PRIVATE_SQL');
});
