import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import type { RfpListItem } from '../../src/lib/data/types';
const h=vi.hoisted(()=>({index:vi.fn(),from:vi.fn(),photos:vi.fn()}));
vi.mock('@/lib/d1/photos-server',()=>({d1PublicPhotos:h.photos}));
vi.mock('@/lib/supabase/read',()=>({createReadClient:()=>({from:h.from})}));
vi.mock('@/lib/supabase/config',()=>({isSupabaseConfigured:()=>true}));
vi.mock('@/lib/data/board-snapshot',()=>({getBoardIndex:h.index}));
vi.mock('@/lib/data/taxonomy',()=>({getTaxonomyRows:async()=>[]}));
import { getRfpTeaser,withPublicRfpPhotos } from '../../src/lib/data/rfps';
const item:RfpListItem={slug:'new-job',title:'New job',summary:null,categories:[],regionName:null,propertyTypeName:null,city:null,province:null,deadline:null,isDemo:false,photoUrls:[],status:'open',sourceType:'property_manager_direct'};
beforeEach(()=>{
 vi.stubEnv('PMRFP_BOARD_BACKEND','d1');vi.stubEnv('VERCEL_ENV','preview');h.index.mockResolvedValue(new Map());
 h.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,maybeSingle:async()=>({data:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:[]}).then(resolve)};return q;});
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
it('keeps absent D1 checkpoint slugs absent instead of consulting the newer source',async()=>{
 expect(await getRfpTeaser('new-job')).toBeNull();expect(h.from).not.toHaveBeenCalled();
});
it('propagates D1 errors from teaser and photo lookup without a source fallback',async()=>{
 h.index.mockRejectedValue(Error('gateway_unavailable'));
 await expect(getRfpTeaser('new-job')).rejects.toThrow('gateway_unavailable');
 await expect(withPublicRfpPhotos([item])).rejects.toThrow('gateway_unavailable');expect(h.from).not.toHaveBeenCalled();
});
it('does not resolve unknown photo slugs from a different provider',async()=>{
 expect(await withPublicRfpPhotos([item])).toEqual([item]);expect(h.from).not.toHaveBeenCalled();
});
it('reads known public-card photos from D1 and propagates failures without source fallback',async()=>{
 const id='00000000-0000-4000-8000-000000000001';h.index.mockResolvedValue(new Map([['new-job',{id}]]));
 h.photos.mockResolvedValue(new Map([[id,['https://images.test/photo.jpg']]]));
 expect((await withPublicRfpPhotos([item]))[0].photoUrls).toEqual(['https://images.test/photo.jpg']);expect(h.from).not.toHaveBeenCalled();
 h.photos.mockRejectedValue(Error('gateway_unavailable'));await expect(withPublicRfpPhotos([item])).rejects.toThrow('gateway_unavailable');expect(h.from).not.toHaveBeenCalled();
});
it('retains same-provider Supabase fallback when its shared snapshot is unavailable',async()=>{
 vi.stubEnv('PMRFP_BOARD_BACKEND','supabase');h.index.mockRejectedValue(Error('source-cache-failed'));
 expect(await getRfpTeaser('new-job')).toBeNull();expect(h.from).toHaveBeenCalledWith('rfp_public');
});
