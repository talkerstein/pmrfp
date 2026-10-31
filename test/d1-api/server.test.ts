import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const getSession=vi.fn();
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getSession}})}));
vi.mock('@/lib/access/request-session',()=>({parseBearerHeader:(header:string|null)=>header===null||header===undefined?{kind:'none'}:header.startsWith('Bearer ')?{kind:'token',token:header.slice(7)}:{kind:'invalid'}}));
import { d1SavedRfpsEnabled, d1AccessToken } from '../../src/lib/d1/server';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('defaults to Supabase and blocks accidental production cutover',()=>{
  vi.stubEnv('PMRFP_SAVED_RFPS_BACKEND','');expect(d1SavedRfpsEnabled()).toBe(false);
  vi.stubEnv('PMRFP_SAVED_RFPS_BACKEND','d1');vi.stubEnv('VERCEL_ENV','preview');expect(d1SavedRfpsEnabled()).toBe(true);
  vi.stubEnv('VERCEL_ENV','production');expect(()=>d1SavedRfpsEnabled()).toThrow('production_cutover_not_enabled');
  vi.stubEnv('PMRFP_SAVED_RFPS_BACKEND','unknown');expect(()=>d1SavedRfpsEnabled()).toThrow('invalid_backend_configuration');
});
it('forwards bearer tokens and never falls back to cookies on a malformed header',async()=>{
  expect(await d1AccessToken(new Request('https://app.test',{headers:{authorization:'Bearer user.jwt.token'}}))).toBe('user.jwt.token');
  await expect(d1AccessToken(new Request('https://app.test',{headers:{authorization:'Basic invalid'}}))).rejects.toMatchObject({status:401});
  expect(getSession).not.toHaveBeenCalled();
});
it('forwards a cookie session token for Worker verification; missing session fails closed',async()=>{
  getSession.mockResolvedValueOnce({data:{session:{access_token:'cookie.jwt.token'}},error:null});
  expect(await d1AccessToken()).toBe('cookie.jwt.token');
  getSession.mockResolvedValueOnce({data:{session:null},error:null});
  await expect(d1AccessToken()).rejects.toMatchObject({status:401});
});
