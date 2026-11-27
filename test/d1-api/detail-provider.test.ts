import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const h=vi.hoisted(()=>({from:vi.fn(),fetch:vi.fn(),session:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:h.from,auth:{getSession:h.session}})}));
vi.mock('@/lib/supabase/config',()=>({isSupabaseConfigured:()=>true}));
import { getFullRfp } from '../../src/lib/data/rfps';
import { DETAIL_TEXT, DETAIL_IDS } from '../../src/lib/d1/detail-contracts';
const id='00000000-0000-4000-8000-000000000001',dataset='a'.repeat(64);
const row={...Object.fromEntries([...DETAIL_TEXT,...DETAIL_IDS].map(k=>[k,null])),id,slug:'private-job',title:'Private job',status:'published',contact_visibility:'pmrfp_mediated',is_demo:false,budget_public:false,budget_min:12345.67,budget_max:null,scope:'Scope from D1'};
beforeEach(()=>{
 vi.stubEnv('PMRFP_DETAIL_BACKEND','d1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('PMRFP_D1_API_URL','https://preview.worker.test');vi.stubEnv('PMRFP_D1_DATASET_SHA256',dataset);vi.stubEnv('PMRFP_D1_GATEWAY_SECRET','synthetic-gateway-secret-at-least-32-characters');vi.stubGlobal('fetch',h.fetch);
 h.session.mockResolvedValue({data:{session:{access_token:'synthetic.token.signature'}},error:null});
 h.from.mockImplementation((table:string)=>{
  if(table==='rfp_posts')throw Error('Source full-row query forbidden in D1 mode');
  const query={select:()=>query,in:()=>query,eq:()=>query,like:()=>query,order:()=>query,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[]}).then(resolve)};return query;
 });h.fetch.mockResolvedValue(Response.json({item:row,dataset}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
it('renders D1 private detail through the existing mapping, keeping source auxiliary photo/category reads explicit',async()=>{
 const result=await getFullRfp('private-job');expect(result).toMatchObject({id,scope:'Scope from D1',budgetMin:12345.67,status:'open',contactVisibility:'pmrfp_mediated',categories:[],photoUrls:[]});
 expect(h.from.mock.calls.map(c=>c[0]).sort()).toEqual(['property_types','regions','rfp_categories','rfp_documents']);
 const [url,init]=h.fetch.mock.calls[0];expect(String(url)).toBe('https://preview.worker.test/v1/rfp-detail?slug=private-job');expect(init.cache).toBe('no-store');expect(init.headers.authorization).toBe('Bearer synthetic.token.signature');
});
it('does not query auxiliary data or fall back after permission denial or Worker failure',async()=>{
 h.fetch.mockResolvedValueOnce(Response.json({item:null,dataset}));expect(await getFullRfp('private-job')).toBeNull();expect(h.from).not.toHaveBeenCalled();
 h.fetch.mockRejectedValueOnce(Error('private source error'));await expect(getFullRfp('private-job')).rejects.toThrow('gateway_unavailable');expect(h.from).not.toHaveBeenCalled();
});
it('rejects missing sessions and production D1 selection before reading private rows',async()=>{
 h.session.mockResolvedValue({data:{session:null},error:null});await expect(getFullRfp('private-job')).rejects.toThrow('sign_in_required');expect(h.fetch).not.toHaveBeenCalled();
 vi.stubEnv('VERCEL_ENV','production');await expect(getFullRfp('private-job')).rejects.toThrow('production_cutover_not_enabled');expect(h.from).not.toHaveBeenCalled();
});
