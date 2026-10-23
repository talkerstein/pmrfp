import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../../workers/d1-api';
import { D1TaxonomyClient } from '../../src/lib/d1/taxonomy-client';
import { d1TaxonomyEnabled } from '../../src/lib/d1/taxonomy-backend';
import type { D1Binding, D1Statement } from '../../src/lib/d1/contracts';

const secret='synthetic-gateway-secret-at-least-32-characters';
let db: DatabaseSync, env: Env;
const id=(n:number)=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
function statement(sql:string,values:(string|number|null)[]=[]):D1Statement {
  return {bind:(...v)=>statement(sql,v),first:async<T>()=>(db.prepare(sql).get(...values)??null) as T|null,all:async<T>()=>({success:true,results:db.prepare(sql).all(...values) as T[],meta:{}}),run:async()=>({success:true,results:[],meta:{changes:Number(db.prepare(sql).run(...values).changes)}})};
}
const auth=vi.fn(async()=>{throw new Error('Public taxonomy must not invoke Auth');});
function request(query='table=regions',method='GET',key=secret){return handleRequest(new Request('https://worker.test/v1/taxonomy?'+query,{method,headers:{'x-pmrfp-gateway-key':key}}),env,auth);}
function client(){return new D1TaxonomyClient({url:'https://worker.test',secret},async(url,init)=>handleRequest(new Request(url,init),env,auth));}
beforeEach(()=>{
  db=new DatabaseSync(':memory:');db.exec(readFileSync('d1/0001-staging-copy.sql','utf8'));
  env={DB:{prepare:statement} as D1Binding,GATEWAY_SECRET:secret,SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SAVED_RFPS_MODE:'read-only'};
  auth.mockClear();
});
afterEach(()=>{db.close();vi.unstubAllEnvs();});
it('paginates public regions without Auth, preserves nullable fields, and hides inactive rows',async()=>{
  const insert=db.prepare('INSERT INTO regions(id,name,slug,province,country,sort_order,active) VALUES(?,?,?,?,?,?,?)');
  for(let n=1;n<=253;n++)insert.run(id(n),'Region '+n,'region-'+n,null,'Canada',n,n===252?0:1);
  const rows=await client().list('regions');
  expect(rows).toHaveLength(252);expect(rows.at(-1)?.id).toBe(id(253));expect(rows.some(r=>r.id===id(252))).toBe(false);
  expect(rows[0]).toEqual({id:id(1),name:'Region 1',slug:'region-1',province:null,country:'Canada',parent_id:null,active:true,sort_order:1});
  expect(auth).not.toHaveBeenCalled();
});
it('returns only the canonical category and property type projections',async()=>{
  db.prepare('INSERT INTO trade_categories(id,name,slug,active,sort_order) VALUES(?,?,?,1,0)').run(id(1),'Roofing','roofing');
  db.prepare('INSERT INTO property_types(id,name,slug,active) VALUES(?,?,?,1)').run(id(2),'Office','office');
  expect(await client().list('trade_categories')).toEqual([{id:id(1),name:'Roofing',slug:'roofing',icon:null,active:true,sort_order:0}]);
  expect(await client().list('property_types')).toEqual([{id:id(2),name:'Office',slug:'office',active:true}]);
});
it.each(['table=users_profile','table=__proto__','table=regions&table=property_types','table=regions&sql=SELECT+1','table=regions&after=bad','table=regions%3BDELETE+FROM+users_profile',''])('rejects unreviewed selectors: %s',async query=>{expect((await request(query)).status).toBe(400);});
it('requires gateway access, rejects writes, and marks responses private',async()=>{
  expect((await request('table=regions','GET','wrong')).status).toBe(401);
  expect((await request('table=regions','POST')).status).toBe(405);
  const response=await request();expect(response.headers.get('cache-control')).toBe('no-store, private');expect(response.headers.get('access-control-allow-origin')).toBeNull();
});
it('fails closed on upstream errors, drops unknown fields, and rejects pagination loops',async()=>{
  const config={url:'https://worker.test',secret};
  const failure=vi.fn(async()=>Response.json({private:'secret SQL'},{status:500}));
  await expect(new D1TaxonomyClient(config,failure).list('regions')).rejects.toMatchObject({status:503,code:'gateway_unavailable'});expect(failure).toHaveBeenCalledTimes(1);
  const row={id:id(1),name:'Office',slug:'office',active:true,private:'never forward'};
  expect(await new D1TaxonomyClient(config,async()=>Response.json({items:[row],next:null})).list('property_types')).toEqual([{id:id(1),name:'Office',slug:'office',active:true}]);
  await expect(new D1TaxonomyClient(config,async()=>Response.json({items:[row],next:id(1)})).list('property_types')).rejects.toMatchObject({status:503});
  await expect(new D1TaxonomyClient(config,async()=>Response.json({items:[{...row,active:false}],next:null})).list('property_types')).rejects.toMatchObject({status:503});
});
it('defaults to Supabase and refuses invalid settings or production D1 cutover',()=>{
  vi.stubEnv('PMRFP_TAXONOMY_BACKEND','');expect(d1TaxonomyEnabled()).toBe(false);
  vi.stubEnv('PMRFP_TAXONOMY_BACKEND','d1');vi.stubEnv('VERCEL_ENV','preview');expect(d1TaxonomyEnabled()).toBe(true);
  vi.stubEnv('VERCEL_ENV','production');expect(()=>d1TaxonomyEnabled()).toThrow('production_cutover_not_enabled');
  vi.stubEnv('PMRFP_TAXONOMY_BACKEND','other');expect(()=>d1TaxonomyEnabled()).toThrow('invalid_backend_configuration');
});
