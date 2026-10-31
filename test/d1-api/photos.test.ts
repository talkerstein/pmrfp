import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../../workers/d1-api';
import { D1PhotosClient } from '../../src/lib/d1/photos-client';
import type { D1Binding, D1Statement } from '../../src/lib/d1/contracts';
const secret='synthetic-gateway-secret-at-least-32-characters',dataset='a'.repeat(64);
const id=(n:number,prefix='0')=>`${prefix}0000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
let db:DatabaseSync,env:Env;
function statement(sql:string,values:(string|number|null)[]=[]):D1Statement {
 return {bind:(...v)=>statement(sql,v),first:async<T>()=>(db.prepare(sql).get(...values)??null) as T|null,all:async<T>()=>({success:true,results:db.prepare(sql).all(...values) as T[],meta:{}}),run:async()=>({success:true,results:[],meta:{changes:Number(db.prepare(sql).run(...values).changes)}})};
}
const auth=vi.fn(async()=>{throw new Error('Public photos must not invoke Auth');});
const request=(query='id='+id(1),method='GET',key=secret)=>handleRequest(new Request('https://worker.test/v1/rfp-photos?'+query,{method,headers:{'x-pmrfp-gateway-key':key}}),env,auth);
const client=()=>new D1PhotosClient({url:'https://worker.test',secret,dataset},async(url,init)=>handleRequest(new Request(url,init),env,auth));
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(readFileSync('d1/0001-staging-copy.sql','utf8'));
 db.exec('CREATE TABLE _migration_manifest(id INTEGER PRIMARY KEY,source_sha256 TEXT,state TEXT)');db.prepare("INSERT INTO _migration_manifest VALUES(1,?,'validated')").run(dataset);
 env={DB:{prepare:statement} as D1Binding,GATEWAY_SECRET:secret,SUPABASE_URL:'',SUPABASE_ANON_KEY:''};auth.mockClear();
});
afterEach(()=>{db.close();vi.unstubAllEnvs();});
function rfp(n:number,status='published') { db.prepare("INSERT INTO rfp_posts(id,title,slug,status,keep_alive_token) VALUES(?,'Listing',?,?,?)").run(id(n),'listing-'+n,status,'synthetic-token-'+n); }
function photo(n:number,parent=1,visibility='public',type='image/jpeg',url='https://images.test/'+n+'.jpg',created='2026-10-31T00:00:00+00:00') {
 db.prepare('INSERT INTO rfp_documents(id,rfp_id,file_url,file_type,visibility,created_at,file_path,file_name) VALUES(?,?,?,?,?,?,?,?)').run(id(n,'a'),id(parent),url,type,visibility,created,'PRIVATE_PATH','PRIVATE_NAME');
}
it('returns only public images on published listings, never invoking Auth',async()=>{
 rfp(1);rfp(2,'draft');photo(1);photo(2,1,'paid_users');photo(3,1,'admin_only');photo(4,2);photo(5,1,'public','application/pdf');photo(6,1,'public','IMAGE/jpeg');
 const response=await request();const text=await response.text();expect(text).not.toMatch(/PRIVATE|pdf/);
 expect(await client().list([id(1),id(2)])).toEqual(new Map([[id(1),['https://images.test/1.jpg']]]));expect(auth).not.toHaveBeenCalled();
});
it('paginates, batches ID lists and restores chronological photo ordering',async()=>{
 for(let n=1;n<=41;n++)rfp(n);
 for(let n=1;n<=252;n++)photo(n,1,'public','image/jpeg',undefined,n===1?'2026-10-31T01:00:00+00:00':'2026-10-31T00:00:00+00:00');
 const result=await client().list(Array.from({length:41},(_,n)=>id(n+1)));expect(result.get(id(1))).toHaveLength(252);expect(result.get(id(1))?.at(-1)).toBe('https://images.test/1.jpg');
 expect(await client().list([])).toEqual(new Map());
});
it.each(['','id=bad','id='+id(1)+'&id='+id(1),'id='+id(1)+'&after=bad','id='+id(1)+'&sql=SELECT+1','id='+id(1)+'&after='+id(2)+'&after='+id(3)])('rejects unreviewed selectors: %s',async query=>{expect((await request(query)).status).toBe(400);});
it('bounds IDs, requires gateway access, rejects writes and incomplete checkpoints',async()=>{
 expect((await request(Array.from({length:41},(_,n)=>'id='+id(n)).join('&'))).status).toBe(400);
 expect((await request('id='+id(1),'GET','wrong')).status).toBe(401);expect((await request('id='+id(1),'POST')).status).toBe(405);
 db.exec("UPDATE _migration_manifest SET state='loading'");expect((await request()).status).toBe(503);
});
it('rejects a different dataset, unrequested IDs, unsafe URLs, and invalid pagination without fallback',async()=>{
 const config={url:'https://worker.test',secret,dataset};
 const raw={id:id(1,'a'),rfpId:id(1),url:'https://images.test/1.jpg',createdAt:'2026-10-31T00:00:00+00:00'};
 for(const body of [{dataset:'b'.repeat(64),items:[],next:null},{dataset,items:[{...raw,rfpId:id(2)}],next:null},{dataset,items:[{...raw,url:'javascript:alert(1)'}],next:null},{dataset,items:[raw],next:raw.id}]) {
  await expect(new D1PhotosClient(config,async()=>Response.json(body)).list([id(1)])).rejects.toMatchObject({status:503});
 }
 await expect(new D1PhotosClient(config,async()=>{throw Error('private upstream');}).list([id(1)])).rejects.toMatchObject({code:'gateway_unavailable'});
});
