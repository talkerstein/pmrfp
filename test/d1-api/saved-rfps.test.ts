import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleRequest, type Env } from '../../workers/d1-api';
import { D1SavedRfpsClient } from '../../src/lib/d1/client';
import type { D1Binding, D1Statement } from '../../src/lib/d1/contracts';

const uid='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002';
const rid='20000000-0000-0000-0000-000000000001';
const secret='synthetic-gateway-secret-at-least-32-characters';
let db: DatabaseSync, env: Env;
function statement(sql: string, values: (string|number|null)[]=[]): D1Statement {
  return {
    bind: (...v)=>statement(sql,v),
    first: async <T>()=>(db.prepare(sql).get(...values) ?? null) as T|null,
    all: async <T>()=>({success:true,results:db.prepare(sql).all(...values) as T[],meta:{}}),
    run: async ()=>({success:true,results:[],meta:{changes:Number(db.prepare(sql).run(...values).changes)}}),
  };
}
const auth: typeof fetch=async (url,init)=>{
  expect(String(url)).toBe('https://synthetic.supabase.co/auth/v1/user');
  expect(init?.redirect).toBe('manual');
  expect(new Headers(init?.headers).get('apikey')).toBe('synthetic-anon');
  const token=new Headers(init?.headers).get('authorization');
  if(token==='Bearer revoked.jwt.token') return Response.json({}, {status:401});
  return Response.json({id:token==='Bearer other.jwt.token'?other:uid,user_metadata:{role:'super_admin',user_id:other}});
};
const transport: typeof fetch=async (url,init)=>handleRequest(new Request(url,init),env,auth);
const client=()=>new D1SavedRfpsClient({url:'https://synthetic.worker.test',secret},transport);
function request(body?: unknown, headers: Record<string,string>={}) {
  return handleRequest(new Request('https://synthetic.worker.test/v1/saved-rfps',{
    method:body===undefined?'GET':'POST',headers:{authorization:'Bearer valid.jwt.token','x-pmrfp-gateway-key':secret,'content-type':'application/json',...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  }),env,auth);
}
beforeEach(()=>{
  db=new DatabaseSync(':memory:'); db.exec(readFileSync('d1/0001-staging-copy.sql','utf8'));
  db.exec("CREATE TABLE _d1_sandbox(key TEXT PRIMARY KEY,value TEXT); INSERT INTO _d1_sandbox VALUES('dataset','synthetic-only')");
  for(const id of [uid,other]) {
    db.prepare('INSERT INTO _auth_users(id) VALUES(?)').run(id);
    db.prepare('INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)').run(id,`${id}@example.invalid`,'trade');
  }
  db.prepare("INSERT INTO rfp_posts(id,title,slug,status,contact_email,scope,budget_min,keep_alive_token) VALUES(?,?,?,'published',?,?,?,?)").run(rid,'Synthetic roof project','synthetic-roof','private@example.invalid','PRIVATE_SCOPE','99999.99','synthetic-token');
  env={DB:{prepare:statement,batch:async()=>{throw new Error('unused');}} as D1Binding,GATEWAY_SECRET:secret,SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SAVED_RFPS_MODE:'sandbox-write'};
});
afterEach(()=>db.close());
describe('Next transport → Worker → Auth verification → real SQLite',()=>{
  it('saves by slug, lists only public fields, deduplicates, and removes',async()=>{
    await client().change('valid.jwt.token',{rfpSlug:'synthetic-roof'});
    await client().change('valid.jwt.token',{rfpId:rid});
    const rows=await client().list('valid.jwt.token');
    expect(rows).toHaveLength(1); expect(rows[0]).toEqual({rfpId:rid,title:'Synthetic roof project',slug:'synthetic-roof',savedAt:expect.any(String)});
    expect(JSON.stringify(rows)).not.toContain('PRIVATE');
    await client().change('valid.jwt.token',{rfpId:rid,action:'unsave'});
    expect(await client().list('valid.jwt.token')).toEqual([]);
  });
  it('isolates users even when metadata claims admin',async()=>{
    await client().change('valid.jwt.token',{rfpId:rid});
    expect(await client().list('other.jwt.token')).toEqual([]);
    await client().change('other.jwt.token',{rfpId:rid,action:'unsave'});
    expect(await client().list('valid.jwt.token')).toHaveLength(1);
  });
  it.each(['suspended','deleted'])('denies %s accounts',async status=>{
    db.prepare('UPDATE users_profile SET status=? WHERE id=?').run(status,uid);
    expect((await request({rfpId:rid})).status).toBe(403);
  });
  it('allows free suppliers and denies unentitled property managers',async()=>{
    db.prepare("UPDATE users_profile SET primary_role='supplier' WHERE id=?").run(uid);
    expect((await request({rfpId:rid})).status).toBe(200);
    db.prepare("UPDATE users_profile SET primary_role='property_manager' WHERE id=?").run(uid);
    expect((await request()).status).toBe(403);
  });
  it('uses D1 paid/trial records and compares offset timestamps chronologically',async()=>{
    const org='30000000-0000-0000-0000-000000000001';
    db.prepare("UPDATE users_profile SET primary_role='property_manager' WHERE id=?").run(uid);
    db.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)').run(org,'Synthetic company','synthetic-company');
    db.prepare('INSERT INTO organization_members(id,organization_id,user_id) VALUES(?,?,?)').run('40000000-0000-0000-0000-000000000001',org,uid);
    // An unexpired trial is enough; a revoked/expired trial cannot authorize a save.
    db.prepare('INSERT INTO trade_trials(organization_id,ends_at) VALUES(?,?)').run(org,'2099-01-01T01:00:00+14:00');
    expect((await request({rfpId:rid})).status).toBe(200);
    db.prepare("UPDATE organizations SET status='suspended' WHERE id=?").run(org);
    expect((await request()).status).toBe(403);
    db.prepare("UPDATE organizations SET status='active' WHERE id=?").run(org);
    db.prepare("UPDATE trade_trials SET ends_at='2000-01-01T23:00:00-12:00' WHERE organization_id=?").run(org);
    expect((await request()).status).toBe(403);
    db.prepare("INSERT INTO subscriptions(id,organization_id,status,tier) VALUES(?,?,'active','seo')").run('50000000-0000-0000-0000-000000000001',org);
    expect((await request()).status).toBe(403);
    db.prepare("UPDATE subscriptions SET tier='pro' WHERE organization_id=?").run(org);
    expect((await request()).status).toBe(200);
    db.prepare("UPDATE subscriptions SET status='canceled' WHERE organization_id=?").run(org);
    expect((await request()).status).toBe(403);
  });
  it('never exposes unpublished saved listings but permits own removal by id',async()=>{
    await client().change('valid.jwt.token',{rfpId:rid});
    db.prepare("UPDATE rfp_posts SET status='draft' WHERE id=?").run(rid);
    expect(await client().list('valid.jwt.token')).toEqual([]);
    expect((await request({rfpSlug:'synthetic-roof'})).status).toBe(404);
    await client().change('valid.jwt.token',{rfpId:rid,action:'unsave'});
    expect(db.prepare('SELECT count(*) AS n FROM saved_rfps').get()?.n).toBe(0);
  });
  it.each([{rfpId:rid,user_id:other},{rfpSlug:"x' OR 1=1 --"},{rfpId:rid,sql:'DELETE FROM users_profile'},{rfpId:rid,action:'delete'},[]])('rejects caller-controlled selectors/SQL: %j',async body=>{
    expect((await request(body)).status).toBe(400);
    expect(db.prepare('SELECT count(*) AS n FROM saved_rfps').get()?.n).toBe(0);
  });
  it('requires both gateway and verified non-revoked user',async()=>{
    expect((await request(undefined,{'x-pmrfp-gateway-key':'wrong'})).status).toBe(401);
    expect((await request(undefined,{authorization:'Bearer revoked.jwt.token'})).status).toBe(401);
    expect((await request(undefined,{authorization:'Bearer garbage'})).status).toBe(401);
  });
  it('fails closed if Auth or D1 is unavailable',async()=>{
    const res=await handleRequest(new Request('https://synthetic.worker.test/v1/saved-rfps',{headers:{authorization:'Bearer valid.jwt.token','x-pmrfp-gateway-key':secret}}),env,async()=>{throw new Error('secret transport details');});
    expect(res.status).toBe(503); expect(await res.text()).not.toContain('secret');
    env.DB={prepare:()=>{throw new Error('private SQL');}} as unknown as D1Binding;
    await expect(client().list('valid.jwt.token')).rejects.toMatchObject({status:503});
  });
  it('refuses Auth redirects without forwarding the bearer token to another origin',async()=>{
    let calls=0;
    const res=await handleRequest(new Request('https://synthetic.worker.test/v1/saved-rfps',{headers:{authorization:'Bearer valid.jwt.token','x-pmrfp-gateway-key':secret}}),env,async(_url,init)=>{
      calls++; expect(init?.redirect).toBe('manual');
      return Response.redirect('https://untrusted.example.invalid',302);
    });
    expect(res.status).toBe(503);expect(calls).toBe(1);
    expect(await res.text()).not.toContain('untrusted');
  });
  it('blocks writes to imported production datasets and read-only mode',async()=>{
    env.SAVED_RFPS_MODE='read-only'; expect((await request({rfpId:rid})).status).toBe(503);
    env.SAVED_RFPS_MODE='sandbox-write'; db.exec('DROP TABLE _d1_sandbox');
    expect((await request({rfpId:rid})).status).toBe(503);
    expect(db.prepare('SELECT count(*) AS n FROM saved_rfps').get()?.n).toBe(0);
  });
  it('enforces body limits and private response caching',async()=>{
    expect((await request({rfpSlug:'x'.repeat(5000)})).status).toBe(413);
    const res=await request(); expect(res.headers.get('cache-control')).toBe('no-store, private');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
