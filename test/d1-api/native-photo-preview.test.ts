import {it,expect,vi} from 'vitest';
import {handleNativePhotoPreview} from '../../src/lib/d1/native-photo-preview';
const project='30000000-0000-4000-8000-000000000001',photo='40000000-0000-4000-8000-000000000001.jpg',origin='https://preview.invalid';
const env={VERCEL_ENV:'preview',PMRFP_NATIVE_AUTH_PREVIEW:'synthetic-only',PMRFP_NATIVE_APP_GATEWAY_SECRET:'synthetic-app-key-at-least-32-characters'};
const token='synthetic-signed-token-value-0001',url=origin+'/api/migration/native-auth/project-photos/'+project+'/'+photo;
const request=(method='GET',body?:BodyInit,headers:Record<string,string>={})=>new Request(url,{method,headers:{origin,cookie:'source-cookie=MUST_NOT_FORWARD; pmrfp-native-preview='+token,...(body?{'content-type':'image/jpeg'}:{}),...headers},...(body?{body}:{})});
it('denies production, missing cookie, unsafe selectors and cross-origin writes before transport',async()=>{
 const fetcher=vi.fn();expect((await handleNativePhotoPreview(request(),project,photo,{...env,VERCEL_ENV:'production'},fetcher)).status).toBe(503);
 expect((await handleNativePhotoPreview(request('GET',undefined,{cookie:''}),project,photo,env,fetcher)).status).toBe(401);
 for(const [req,p,f] of [[request('GET',undefined,{range:'bytes=0-1'}),project,photo],[request(),project,'../../secret'],[request('PUT',new Uint8Array([255,216,255]),{origin:'https://evil.invalid'}),project,photo]] as const)expect((await handleNativePhotoPreview(req,p,f,env,fetcher)).status).toBe(400);
 expect(fetcher).not.toHaveBeenCalled();
});
it('streams only JPEG bytes with private headers and forwards only the signed preview session',async()=>{
 const bytes=new Uint8Array([255,216,255,0]);const fetcher=vi.fn(async(target,options)=>{expect(target).toBe('https://pmrfp-native-auth-app-sandbox.pmrfp.workers.dev/v1/project-photos/'+project+'/'+photo);expect(options.headers).toMatchObject({'x-pmrfp-native-session':'__Secure-better-auth.session_token='+token});expect(JSON.stringify(options)).not.toContain('source-cookie');return new Response(bytes,{headers:{'content-type':'image/jpeg','content-length':'4','set-cookie':'MUST_NOT_FORWARD=1'}});});
 const response=await handleNativePhotoPreview(request(),project,photo,env,fetcher as typeof fetch);expect(response.status).toBe(200);expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('set-cookie')).toBeNull();
 const head=await handleNativePhotoPreview(request('HEAD'),project,photo,env,fetcher as typeof fetch);expect(await head.text()).toBe('');expect(head.headers.get('content-length')).toBe('4');
});
it('bounds uploads and preserves owner/visibility denials without exposing provider details',async()=>{
 const fetcher=vi.fn();expect((await handleNativePhotoPreview(request('PUT',new Uint8Array(10*1024*1024+1)),project,photo,env,fetcher)).status).toBe(413);expect(fetcher).not.toHaveBeenCalled();
 const denied=await handleNativePhotoPreview(request(),project,photo,env,async()=>new Response('PRIVATE_SQL_DETAIL',{status:404}));expect(denied.status).toBe(404);expect(await denied.text()).not.toContain('PRIVATE_SQL');
 const invalid=await handleNativePhotoPreview(request(),project,photo,env,async()=>new Response('<html>',{headers:{'content-type':'text/html'}}));expect(invalid.status).toBe(503);
 const removed=await handleNativePhotoPreview(request('DELETE'),project,photo,env,async()=>new Response(null,{status:204}));expect(removed.status).toBe(204);expect(await removed.text()).toBe('');
});
