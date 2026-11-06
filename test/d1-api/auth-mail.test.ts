import {it,expect,vi} from 'vitest';
import {handleMailRelay} from '../../src/lib/d1/auth-mail';
import {verifyHostingerSmtp} from '../../src/lib/d1/hostinger-mail.mjs';
const key='synthetic-mail-relay-key-at-least-32-characters';
const env={VERCEL_ENV:'preview',PMRFP_MIGRATION_MAIL_MODE:'synthetic-only',PMRFP_MIGRATION_MAIL_GATEWAY_SECRET:key,PMRFP_MIGRATION_SMTP_PASSWORD:'synthetic-password'};
const request=(value=key,method='GET',query='')=>new Request('https://preview.invalid/api/migration/auth-mail'+query,{method,headers:{'x-pmrfp-mail-gateway-key':value}});
it('requires a preview mode and private gateway before SMTP; production never activates',async()=>{
 const verify=vi.fn();for(const config of [{...env,VERCEL_ENV:'production'},{...env,VERCEL_ENV:'production',NODE_ENV:'development'},{...env,PMRFP_MIGRATION_MAIL_MODE:'production'},{...env,PMRFP_MIGRATION_MAIL_GATEWAY_SECRET:''}])expect((await handleMailRelay(request(),config,verify)).status).toBe(503);
 expect((await handleMailRelay(request('wrong'),env,verify)).status).toBe(401);expect(verify).not.toHaveBeenCalled();
});
it('allows only a no-send verification and never exposes provider diagnostics',async()=>{
 const verify=vi.fn(async()=>({authenticated:true,emailsSent:0}));const response=await handleMailRelay(request(),env,verify);expect(response.status).toBe(200);expect(await response.json()).toEqual({authenticated:true,emailsSent:0});expect(response.headers.get('cache-control')).toBe('private, no-store');
 for(const req of [request(key,'POST'),request(key,'GET','?to=other@example.invalid')])expect((await handleMailRelay(req,env,verify)).status).toBe(405);
 const error=await handleMailRelay(request(),env,async()=>{throw Error('SENSITIVE_PROVIDER_DETAIL');});expect(await error.text()).not.toContain('SENSITIVE');expect(error.status).toBe(503);
});
it('uses fixed verified Hostinger TLS, disables logging/attachment I/O and closes without sending',async()=>{
 let options:Record<string,unknown>|undefined;const close=vi.fn();const factory=(value:Record<string,unknown>)=>{options=value;return{verify:async()=>true,close,sendMail:()=>{throw Error('MUST_NOT_SEND');}};};
 expect(await verifyHostingerSmtp({username:'info@pmrfp.com',password:'synthetic-password'},factory)).toEqual({authenticated:true,emailsSent:0});expect(options).toMatchObject({host:'smtp.hostinger.com',port:465,secure:true,tls:{rejectUnauthorized:true},logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});expect(close).toHaveBeenCalledTimes(1);
});
it('validates only bounded synthetic callback messages without sending or returning tokens',async()=>{
 const verify=vi.fn();const capture={...env,PMRFP_MIGRATION_MAIL_CAPTURE:'enabled'};
 const message={kind:'reset',userId:'00000000-0000-4000-8000-000000000011',to:'fixture@example.invalid',url:'https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev/api/auth/reset-password/synthetic_reset_token_0001',expiresIn:900};
 const send=(body:unknown)=>handleMailRelay(new Request('https://preview.invalid/api/migration/auth-mail',{method:'POST',headers:{'x-pmrfp-mail-gateway-key':key,'content-type':'application/json'},body:JSON.stringify(body)}),capture,verify);
 const good=await send(message);expect(good.status).toBe(200);expect(await good.json()).toEqual({validated:true,emailsSent:0,mode:'synthetic-capture'});
 for(const bad of [{...message,to:'customer@example.com'},{...message,userId:'real-user'},{...message,url:'https://evil.invalid/reset'},{...message,url:message.url+'?callbackURL=https://evil.invalid'},{...message,text:'arbitrary'},{...message,url:'x'.repeat(9000)}])expect((await send(bad)).status).toBe(400);
 expect(verify).not.toHaveBeenCalled();
});
