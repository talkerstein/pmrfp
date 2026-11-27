import { afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({enabled:vi.fn(),change:vi.fn(),token:vi.fn(),session:vi.fn(),supabase:vi.fn()}));
vi.mock('@/lib/supabase/config',()=>({isServiceConfigured:()=>false,isSupabaseConfigured:()=>false}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.supabase}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/access/access',()=>({getSession:mocks.session}));
vi.mock('@/lib/access/free-actions',()=>({canSaveRfps:()=>true,viewerOf:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRateLimit:async()=>null,rateLimitResponse:vi.fn()}));
vi.mock('@/lib/d1/server',()=>({d1SavedRfpsEnabled:mocks.enabled,d1SavedRfpsClient:()=>({change:mocks.change}),d1AccessToken:mocks.token}));
import { POST } from '../../src/app/api/save-rfp/route';
import { D1ApiError } from '../../src/lib/d1/contracts';
const rid='20000000-0000-0000-0000-000000000001';
const request=(body:unknown)=>new Request('https://app.test/api/save-rfp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
afterEach(()=>vi.resetAllMocks());
it('keeps the existing Supabase/demo path by default',async()=>{
  mocks.enabled.mockReturnValue(false);
  const res=await POST(request({rfpId:rid})); expect(await res.json()).toEqual({ok:true,demo:true}); expect(mocks.change).not.toHaveBeenCalled();
});
it('routes D1 saves through the verified transport and skips legacy writes',async()=>{
  mocks.enabled.mockReturnValue(true);mocks.token.mockResolvedValue('user.jwt.token');mocks.change.mockResolvedValue(undefined);
  expect((await POST(request({rfpId:rid}))).status).toBe(200);
  expect(mocks.change).toHaveBeenCalledWith('user.jwt.token',{rfpId:rid,rfpSlug:undefined,action:'save'});
  expect(mocks.supabase).not.toHaveBeenCalled();expect(mocks.session).not.toHaveBeenCalled();
});
it('never falls back to a source write after D1 failure',async()=>{
  mocks.enabled.mockReturnValue(true);mocks.token.mockResolvedValue('user.jwt.token');mocks.change.mockRejectedValue(new D1ApiError(503,'gateway_unavailable'));
  expect((await POST(request({rfpId:rid}))).status).toBe(503);expect(mocks.supabase).not.toHaveBeenCalled();expect(mocks.session).not.toHaveBeenCalled();
});
it('rejects a large body before sending it upstream',async()=>{
  mocks.enabled.mockReturnValue(true);
  expect((await POST(request({rfpSlug:'x'.repeat(5000)}))).status).toBe(413);expect(mocks.change).not.toHaveBeenCalled();
});
