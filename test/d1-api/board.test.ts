import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../../workers/d1-api';
import { D1BoardClient } from '../../src/lib/d1/board-client';
import { d1BoardEnabled } from '../../src/lib/d1/board-backend';
import { publicBoardRow, shardRange } from '../../src/lib/d1/board-contracts';
import type { D1Binding, D1Statement } from '../../src/lib/d1/contracts';
const secret='synthetic-gateway-secret-at-least-32-characters',dataset='a'.repeat(64);
const id=(n:number,prefix='0')=>`${prefix}0000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
let db:DatabaseSync,env:Env;
function statement(sql:string,values:(string|number|null)[]=[]):D1Statement {
 return {bind:(...v)=>statement(sql,v),first:async<T>()=>(db.prepare(sql).get(...values)??null) as T|null,all:async<T>()=>({success:true,results:db.prepare(sql).all(...values) as T[],meta:{}}),run:async()=>({success:true,results:[],meta:{changes:Number(db.prepare(sql).run(...values).changes)}})};
}
const auth=vi.fn(async()=>{throw new Error('Public board must not invoke Auth');});
const request=(query='shard=0',method='GET',key=secret)=>handleRequest(new Request('https://worker.test/v1/board?'+query,{method,headers:{'x-pmrfp-gateway-key':key}}),env,auth);
const client=()=>new D1BoardClient({url:'https://worker.test',secret,dataset},async(url,init)=>handleRequest(new Request(url,init),env,auth));
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(readFileSync('d1/0001-staging-copy.sql','utf8'));
 db.exec('CREATE TABLE _migration_manifest(id INTEGER PRIMARY KEY,source_sha256 TEXT,state TEXT)');db.prepare("INSERT INTO _migration_manifest VALUES(1,?,'validated')").run(dataset);
 env={DB:{prepare:statement} as D1Binding,GATEWAY_SECRET:secret,SUPABASE_URL:'',SUPABASE_ANON_KEY:''};auth.mockClear();
});
afterEach(()=>{db.close();vi.unstubAllEnvs();});
it('pages published rows, keeps shard bounds and excludes all paid/contact fields',async()=>{
 const insert=db.prepare("INSERT INTO rfp_posts(id,title,slug,status,contact_email,scope,budget_min,keep_alive_token) VALUES(?,?,?,?,'private@example.invalid','PRIVATE_SCOPE','99999.99',?)");
 for(let n=1;n<=252;n++)insert.run(id(n),'Public title '+n,'public-'+n,n===251?'draft':'published','PRIVATE_TOKEN_'+n);
 insert.run(id(1,'f'),'Last shard','last-shard','published','PRIVATE_TOKEN_last');
 const rows=await client().shard(0);expect(rows).toHaveLength(251);expect(rows.at(-1)?.id).toBe(id(252));
 expect(JSON.stringify(rows)).not.toMatch(/PRIVATE|private@example|99999/);expect(rows.every(r=>r.id[0]==='0')).toBe(true);
 expect((await client().shard(15)).map(r=>r.slug)).toEqual(['last-shard']);expect(auth).not.toHaveBeenCalled();
});
it('orders linked category IDs by link ID, matching the existing public snapshot',async()=>{
 db.prepare("INSERT INTO rfp_posts(id,title,slug,status,keep_alive_token) VALUES(?,'Roof','roof','published','synthetic-token')").run(id(1));
 for(const n of [1,2])db.prepare('INSERT INTO trade_categories(id,name,slug) VALUES(?,?,?)').run(id(n,'a'),'Trade '+n,'trade-'+n);
 db.prepare('INSERT INTO rfp_categories(id,rfp_id,category_id) VALUES(?,?,?)').run(id(2,'b'),id(1),id(1,'a'));
 db.prepare('INSERT INTO rfp_categories(id,rfp_id,category_id) VALUES(?,?,?)').run(id(1,'b'),id(1),id(2,'a'));
 const rows=await client().shard(0);expect(rows[0].categoryIds).toEqual([id(2,'a'),id(1,'a')]);expect(rows[0].summary).toBeNull();
});
it.each(['','shard=-1','shard=16','shard=00','shard=1&shard=2','shard=0&sql=SELECT+1','shard=0&after=bad','shard=0&after='+id(1,'f')])('rejects unreviewed selectors: %s',async q=>{expect((await request(q)).status).toBe(400);});
it('requires a validated dataset and never substitutes a different checkpoint',async()=>{
 db.exec("UPDATE _migration_manifest SET state='loading'");expect((await request()).status).toBe(503);
 db.prepare("UPDATE _migration_manifest SET state='validated',source_sha256=?").run('b'.repeat(64));
 await expect(client().shard(0)).rejects.toMatchObject({status:503});
});
it('requires the gateway, rejects writes and arbitrary client shard arguments',async()=>{
 expect((await request('shard=0','GET','wrong')).status).toBe(401);expect((await request('shard=0','POST')).status).toBe(405);
 for(const n of [-1,16,0.5])expect(()=>shardRange(n)).toThrow('invalid_request');
 const response=await request();expect(response.headers.get('cache-control')).toBe('no-store, private');expect(response.headers.get('access-control-allow-origin')).toBeNull();
});
it('whitelists valid public fields and rejects missing or malformed upstream data',()=>{
 const row={id:id(1),slug:'public',title:'Public',summary:null,regionId:null,propertyTypeId:null,city:null,province:null,deadline:null,isDemo:false,sourceType:null,gcProjectName:null,awardedRfpId:null,publishedAt:null,createdAt:null,categoryIds:[]};
 expect(publicBoardRow({...row,scope:'private'})).toEqual(row);
 expect(()=>publicBoardRow({...row,categoryIds:['not-a-uuid']})).toThrow('gateway_unavailable');
 expect(()=>publicBoardRow({...row,summary:undefined})).toThrow('gateway_unavailable');
 expect(()=>new D1BoardClient({url:'https://worker.test',secret,dataset:''})).toThrow('invalid_backend_configuration');
});
it('defaults to Supabase and blocks production D1 selection',()=>{
 vi.stubEnv('PMRFP_BOARD_BACKEND','');expect(d1BoardEnabled()).toBe(false);
 vi.stubEnv('PMRFP_BOARD_BACKEND','d1');vi.stubEnv('VERCEL_ENV','preview');expect(d1BoardEnabled()).toBe(true);
 vi.stubEnv('VERCEL_ENV','production');expect(()=>d1BoardEnabled()).toThrow('production_cutover_not_enabled');
 vi.stubEnv('PMRFP_BOARD_BACKEND','other');expect(()=>d1BoardEnabled()).toThrow('invalid_backend_configuration');
});
