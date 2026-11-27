import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {readSyntheticRfpDetail,requireSyntheticDetailDatabase} from '../../workers/d1-api/synthetic-detail';
import type {D1Binding,D1Statement} from '../../src/lib/d1/contracts';
let db:DatabaseSync;const user='00000000-0000-4000-8000-000000000011',other='00000000-0000-4000-8000-000000000012',org='20000000-0000-4000-8000-000000000001',rid='10000000-0000-4000-8000-000000000001';
const now=Date.parse('2026-11-06T00:00:00.123Z');
function statement(sql:string,args:(string|number|null)[]=[]):D1Statement{return {bind:(...values)=>statement(sql,values),first:async<T>()=>(db.prepare(sql).get(...args)||null) as T|null,all:async<T>()=>({success:true,results:db.prepare(sql).all(...args) as T[],meta:{}}),run:async()=>({success:true,results:[],meta:{changes:Number(db.prepare(sql).run(...args).changes)}})};}
const binding={prepare:statement} as D1Binding;
const read=(id=user)=>readSyntheticRfpDetail(binding,new Request('https://api.invalid/v1/rfp-detail?slug=private-test'),id,now);
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(readFileSync('d1/0001-staging-copy.sql','utf8'));db.exec("CREATE TABLE _migration_manifest(id INTEGER PRIMARY KEY,source_sha256 TEXT,state TEXT);CREATE TABLE _d1_sandbox(key TEXT PRIMARY KEY,value TEXT);INSERT INTO _d1_sandbox VALUES('dataset','synthetic-only')");db.prepare("INSERT INTO _migration_manifest VALUES(1,?,'validated')").run('a'.repeat(64));
 for(const id of [user,other]){db.prepare('INSERT INTO _auth_users(id) VALUES(?)').run(id);db.prepare("INSERT INTO users_profile(id,email,primary_role,status) VALUES(?,?,'trade','active')").run(id,'fixture-'+id.slice(-2)+'@example.invalid');}
 db.prepare("INSERT INTO organizations(id,name,slug,organization_type,status) VALUES(?,'Fake trade','fake-trade','trade_company','active')").run(org);db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('50000000-0000-4000-8000-000000000001',?,?,'owner')").run(org,user);
 db.prepare("INSERT INTO rfp_posts(id,title,slug,status,scope,contact_email,keep_alive_token,posted_by_user_id) VALUES(?,'Fake private RFP','private-test','published','PRIVATE_SYNTHETIC_SCOPE','buyer@example.invalid','NEVER_EXPOSE',?)").run(rid,other);
});afterEach(()=>db.close());
it('requires the isolated marker and fabricated listing inventory before native detail can serve',async()=>{
 await requireSyntheticDetailDatabase(binding);db.exec("UPDATE _d1_sandbox SET value='copied'");await expect(requireSyntheticDetailDatabase(binding)).rejects.toMatchObject({status:503});db.exec("UPDATE _d1_sandbox SET value='synthetic-only'");db.prepare('UPDATE rfp_posts SET id=?').run(user);await expect(requireSyntheticDetailDatabase(binding)).rejects.toMatchObject({status:503});
});
it('current trial enables only the published private projection; expiry/revocation is immediate and strips server-only fields',async()=>{
 expect((await read()).item).toBeNull();db.prepare('INSERT INTO trade_trials(organization_id,ends_at) VALUES(?,?)').run(org,new Date(now+60000).toISOString());const allowed=await read();expect(allowed.item?.scope).toBe('PRIVATE_SYNTHETIC_SCOPE');expect(JSON.stringify(allowed)).not.toContain('NEVER_EXPOSE');expect(allowed.item).not.toHaveProperty('posted_by_user_id');
 db.prepare('UPDATE trade_trials SET ends_at=?').run(new Date(now).toISOString());expect((await read()).item).toBeNull();db.prepare('UPDATE trade_trials SET ends_at=?').run('2026-11-06T00:00:00.123999Z');expect((await read()).item).toBeNull();
 db.prepare('UPDATE trade_trials SET ends_at=?').run(new Date(now+60000).toISOString());db.exec("UPDATE organizations SET status='suspended'");expect((await read()).item).toBeNull();
});
it('owned/member/admin reads stay explicit, never inferred from editable Auth metadata',async()=>{
 expect((await read()).item).toBeNull();expect((await read(other)).item?.scope).toBe('PRIVATE_SYNTHETIC_SCOPE');db.exec("UPDATE rfp_posts SET status='draft'");expect((await read(other)).item).not.toBeNull();
 db.prepare('UPDATE rfp_posts SET posted_by_organization_id=?').run(org);expect((await read()).item).not.toBeNull();db.exec('UPDATE rfp_posts SET posted_by_organization_id=NULL');db.prepare("UPDATE users_profile SET primary_role='admin' WHERE id=?").run(user);expect((await read()).item).not.toBeNull();db.prepare("UPDATE users_profile SET status='suspended' WHERE id=?").run(user);await expect(read()).rejects.toMatchObject({status:403});
});
it('supplier trials do not grant trade access; active/comped eligible subscriptions do and cancellation revokes it',async()=>{
 db.exec("UPDATE organizations SET organization_type='supplier'");db.prepare('INSERT INTO trade_trials(organization_id,ends_at) VALUES(?,?)').run(org,new Date(now+60000).toISOString());expect((await read()).item).toBeNull();
 db.prepare("INSERT INTO subscriptions(id,organization_id,status,tier) VALUES('60000000-0000-4000-8000-000000000001',?,'comped','pro')").run(org);expect((await read()).item).not.toBeNull();db.exec("UPDATE subscriptions SET status='canceled'");expect((await read()).item).toBeNull();
});
