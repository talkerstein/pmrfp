import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../../workers/d1-api';
import { D1DetailClient } from '../../src/lib/d1/detail-client';
import { d1DetailEnabled } from '../../src/lib/d1/detail-backend';
import type { D1Binding, D1Statement } from '../../src/lib/d1/contracts';
const secret='synthetic-gateway-secret-at-least-32-characters',dataset='a'.repeat(64),token='synthetic.token.signature';
const id='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
let db:DatabaseSync,env:Env,permission:unknown,permissionStatus:number;
function statement(sql:string,values:(string|number|null)[]=[]):D1Statement {
 return {bind:(...v)=>statement(sql,v),first:async<T>()=>(db.prepare(sql).get(...values)??null) as T|null,all:async<T>()=>({success:true,results:db.prepare(sql).all(...values) as T[],meta:{}}),run:async()=>({success:true,results:[],meta:{changes:Number(db.prepare(sql).run(...values).changes)}})};
}
const source=vi.fn<typeof fetch>(async(input,init)=>{
 const url=new URL(String(input));
 expect(url.origin).toBe('https://source.test'); expect(init?.redirect).toBe('manual'); expect(init?.cache).toBe('no-store');
 expect(new Headers(init?.headers).get('authorization')).toBe('Bearer '+token);
 if(url.pathname==='/auth/v1/user')return Response.json({id:user});
 expect(url.pathname).toBe('/rest/v1/rfp_posts');expect(Object.fromEntries(url.searchParams)).toEqual({select:'id',slug:'eq.private-job',limit:'2'});
 return Response.json(permission,{status:permissionStatus});
});
const request=(query='slug=private-job',method='GET',key=secret,bearer=token)=>handleRequest(new Request('https://worker.test/v1/rfp-detail?'+query,{method,headers:{'x-pmrfp-gateway-key':key,authorization:'Bearer '+bearer}}),env,source);
const client=(checkpoint=dataset)=>new D1DetailClient({url:'https://worker.test',secret,dataset:checkpoint},async(url,init)=>handleRequest(new Request(url,init),env,source));
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(readFileSync('d1/0001-staging-copy.sql','utf8'));
 db.exec('CREATE TABLE _migration_manifest(id INTEGER PRIMARY KEY,source_sha256 TEXT,state TEXT)');db.prepare("INSERT INTO _migration_manifest VALUES(1,?,'validated')").run(dataset);
 db.prepare("INSERT INTO rfp_posts(id,title,slug,status,scope,contact_email,budget_min,keep_alive_token,source_notes) VALUES(?,'Private job','private-job','published','PRIVATE_SCOPE','buyer@example.invalid','12345.67','SECRET_KEEP_ALIVE','Source notes')").run(id);
 env={DB:{prepare:statement} as D1Binding,GATEWAY_SECRET:secret,SUPABASE_URL:'https://source.test',SUPABASE_ANON_KEY:'public-test-key'};
 permission=[{id}];permissionStatus=200;source.mockClear();
});
afterEach(()=>{db.close();vi.unstubAllEnvs();});
it('requires live Auth and source RLS before returning only allowed detail fields',async()=>{
 const row=await client().get(token,'private-job');expect(row).toMatchObject({id,scope:'PRIVATE_SCOPE',contact_email:'buyer@example.invalid',budget_min:12345.67,is_demo:false,budget_public:false});
 expect(JSON.stringify(row)).not.toMatch(/SECRET_KEEP_ALIVE|posted_by|moderation/);expect(source).toHaveBeenCalledTimes(2);
});
it('immediately denies a revoked entitlement even when the old copy still contains the row',async()=>{
 expect(await client().get(token,'private-job')).not.toBeNull();permission=[];
 expect(await client().get(token,'private-job')).toBeNull();expect(source).toHaveBeenCalledTimes(4);
});
it('hides unpublished rows from users denied by source RLS and supports actual source-authorized owners',async()=>{
 db.exec("UPDATE rfp_posts SET status='draft'");permission=[];expect(await client().get(token,'private-job')).toBeNull();
 permission=[{id}];expect((await client().get(token,'private-job'))?.status).toBe('draft');
});
it.each([301,401,403,429,500])('fails closed on source permission HTTP %s',async(status)=>{
 permissionStatus=status;const response=await request();expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE_SCOPE');
});
it.each([null,{},[{id:'bad'}],[{id},{id}],{error:'PRIVATE_SOURCE_ERROR'}])('rejects malformed source permission data %j',async(value)=>{
 permission=value;const response=await request();expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE_SOURCE_ERROR');
});
it('refuses an authorized record not synchronized under the same ID and slug',async()=>{
 permission=[{id:user}];await expect(client().get(token,'private-job')).rejects.toMatchObject({status:409,code:'record_not_synced'});
 db.exec("UPDATE rfp_posts SET slug='changed-slug'");permission=[{id}];expect((await request()).status).toBe(409);
});
it('requires validated and pinned checkpoint, never accepting another snapshot',async()=>{
 db.exec("UPDATE _migration_manifest SET state='loading'");expect((await request()).status).toBe(503);expect(source).toHaveBeenCalledTimes(1);
 db.exec("UPDATE _migration_manifest SET state='validated'");await expect(client('b'.repeat(64)).get(token,'private-job')).rejects.toMatchObject({status:503});
});
it.each(['','slug=private-job&slug=other','slug=private-job&userId='+user,'slug=bad%27%20OR%201=1'])('rejects selector %s without a source permission read',async(query)=>{
 expect((await request(query)).status).toBe(400);expect(source).toHaveBeenCalledTimes(1);
});
it('rejects bad gateway, missing Auth and writes before touching private data',async()=>{
 expect((await request('slug=private-job','GET','wrong')).status).toBe(401);
 expect((await request('slug=private-job','GET',secret,'invalid')).status).toBe(401);
 expect((await request('slug=private-job','POST')).status).toBe(405);expect(source).not.toHaveBeenCalled();
 const response=await request();expect(response.headers.get('cache-control')).toBe('no-store, private');expect(response.headers.get('access-control-allow-origin')).toBeNull();
});
it('drops unknown upstream fields and rejects invalid detail data',async()=>{
 const row=await client().get(token,'private-job');
 const transport=vi.fn<typeof fetch>(async()=>Response.json({dataset,item:{...row,keep_alive_token:'SECRET'}}));
 const c=new D1DetailClient({url:'https://worker.test',secret,dataset},transport);expect(JSON.stringify(await c.get(token,'private-job'))).not.toContain('SECRET');
 transport.mockImplementation(async()=>Response.json({dataset,item:{...row,contact_visibility:'bad'}}));await expect(c.get(token,'private-job')).rejects.toMatchObject({status:503});
});
it('keeps Supabase as default and blocks production cutover',()=>{
 vi.stubEnv('PMRFP_DETAIL_BACKEND','');expect(d1DetailEnabled()).toBe(false);vi.stubEnv('PMRFP_DETAIL_BACKEND','d1');vi.stubEnv('VERCEL_ENV','preview');expect(d1DetailEnabled()).toBe(true);
 vi.stubEnv('VERCEL_ENV','production');expect(()=>d1DetailEnabled()).toThrow('production_cutover_not_enabled');vi.stubEnv('PMRFP_DETAIL_BACKEND','invalid');expect(()=>d1DetailEnabled()).toThrow('invalid_backend_configuration');
});
