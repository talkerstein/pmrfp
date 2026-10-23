import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const h=vi.hoisted(()=>({keys:[] as unknown[][],read:vi.fn(),fetch:vi.fn()}));
vi.mock('next/cache',()=>({unstable_cache:(fn:(...a:unknown[])=>unknown)=>(...args:unknown[])=>{h.keys.push(args);return fn(...args);}}));
vi.mock('@/lib/supabase/read',()=>({createReadClient:h.read}));
import { getBoardRows, fetchBoardShard } from '../../src/lib/data/board-snapshot';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();vi.unstubAllGlobals();h.keys.length=0;});
function enable(){vi.stubEnv('PMRFP_BOARD_BACKEND','d1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('PMRFP_D1_API_URL','https://preview.worker.test');vi.stubEnv('PMRFP_D1_DATASET_SHA256','a'.repeat(64));vi.stubEnv('PMRFP_D1_GATEWAY_SECRET','synthetic-gateway-secret-at-least-32-characters');vi.stubGlobal('fetch',h.fetch);}
it('keeps concurrency bounded, deduplicates overlapping renders and separates dataset cache keys',async()=>{
 enable();let active=0,max=0;
 h.fetch.mockImplementation(async()=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return Response.json({items:[],next:null,dataset:process.env.PMRFP_D1_DATASET_SHA256});});
 expect(await Promise.all([getBoardRows(),getBoardRows()])).toEqual([[],[]]);
 expect(h.fetch).toHaveBeenCalledTimes(16);expect(max).toBeLessThanOrEqual(4);expect(h.read).not.toHaveBeenCalled();
 const firstKey=h.keys[0][1];vi.stubEnv('PMRFP_D1_DATASET_SHA256','b'.repeat(64));await getBoardRows();
 expect(h.keys.at(-1)?.[1]).not.toBe(firstKey);expect(String(h.keys.at(-1)?.[1])).toContain('b'.repeat(64));
});
it('fails closed on D1 failure and on production selection, without source fallback',async()=>{
 enable();h.fetch.mockRejectedValue(new Error('gateway_unavailable'));
 await expect(fetchBoardShard(0)).rejects.toThrow('gateway_unavailable');expect(h.read).not.toHaveBeenCalled();
 vi.stubEnv('VERCEL_ENV','production');await expect(getBoardRows()).rejects.toThrow('production_cutover_not_enabled');expect(h.read).not.toHaveBeenCalled();
});
