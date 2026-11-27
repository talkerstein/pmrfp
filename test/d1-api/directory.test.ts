import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach,beforeEach,expect,it } from 'vitest';
import { handleRequest,type Env } from '../../workers/d1-api';
import type { D1Binding,D1Statement } from '../../src/lib/d1/contracts';
let db:DatabaseSync,env:Env;
const key='directory-only-test-key-at-least-32-characters';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function statement(sql:string,values:(string|number|null)[]=[]):D1Statement{return {bind:(...v)=>statement(sql,v),first:async<T>()=>(db.prepare(sql).get(...values)??null) as T|null,all:async<T>()=>({success:true,results:db.prepare(sql).all(...values) as T[],meta:{}}),run:async()=>({success:true,results:[],meta:{}})};}
const request=(q='',method='GET',secret=key)=>handleRequest(new Request('https://worker.test/v1/directory'+q,{method,headers:{'x-pmrfp-gateway-key':secret}}),env);
beforeEach(()=>{db=new DatabaseSync(':memory:');db.exec(readFileSync('d1/production-staging-copy-2026-11-05.sql','utf8'));db.exec("CREATE TABLE _migration_manifest(id INTEGER PRIMARY KEY,state TEXT,source_sha256 TEXT)");db.prepare("INSERT INTO _migration_manifest VALUES(1,'validated',?)").run('a'.repeat(64));env={DB:{prepare:statement, batch: async (items: D1Statement[]) => Promise.all(items.map(item => item.all()))} as D1Binding,GATEWAY_SECRET:key,SUPABASE_URL:"",SUPABASE_ANON_KEY:""};});
afterEach(()=>db.close());
it('lists only active approved real businesses and never exports hidden contact/address data',async()=>{
 const insert=db.prepare("INSERT INTO organizations(id,name,slug,profile_status,status,is_demo,public_contact_visibility,email,address_line_1) VALUES(?,?,?,?,?,?,?,'PRIVATE_EMAIL','PRIVATE_ADDRESS')");
 insert.run(id(1),'Public','public','approved','active',0,'hide_contact');
 insert.run(id(2),'Draft','draft','draft','active',0,'show_contact');
 insert.run(id(3),'Demo','demo','approved','active',1,'show_contact');
 insert.run(id(4),'Suspended','suspended','approved','suspended',0,'show_contact');
 const response=await request();expect(response.status).toBe(200);const body=await response.json();expect(body.items.map((x:{slug:string})=>x.slug)).toEqual(['public']);expect(JSON.stringify(body)).not.toMatch(/PRIVATE/);expect(body.items[0].email).toBeNull();
 expect((await (await request('?slug=draft')).json()).items).toEqual([]);
});
it('permits only explicitly public contact fields and bounded selectors',async()=>{
 db.prepare("INSERT INTO organizations(id,name,slug,profile_status,public_contact_visibility,email) VALUES(?,'Public','public','approved','show_contact','PUBLIC_EMAIL')").run(id(1));
 expect((await (await request('?slug=public')).json()).items[0].email).toBe('PUBLIC_EMAIL');
 for(const q of ['?sql=SELECT+1','?slug=a&slug=b','?type=admin','?slug=../secret'])expect((await request(q)).status).toBe(400);
 expect((await request('','POST')).status).toBe(405);expect((await request('','GET','wrong')).status).toBe(401);
 db.exec("UPDATE _migration_manifest SET state='loading'");expect((await request()).status).toBe(503);
});

it('publishes only a validated checkpoint and requires the gateway key', async () => {
  const checkpoint = (secret: string) => handleRequest(new Request('https://worker.test/v1/checkpoint', {
    headers: { 'x-pmrfp-gateway-key': secret },
  }), env);
  expect((await checkpoint('wrong')).status).toBe(401);
  expect(await (await checkpoint(key)).json()).toEqual({ dataset: 'a'.repeat(64) });
  db.exec("UPDATE _migration_manifest SET state='loading'");
  expect((await checkpoint(key)).status).toBe(503);
  db.prepare("UPDATE _migration_manifest SET state='validated', source_sha256=?").run('b'.repeat(64));
  expect(await (await checkpoint(key)).json()).toEqual({ dataset: 'b'.repeat(64) });
});
