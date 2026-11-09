import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {hash} from 'bcryptjs';
import {mapMigrationAccount,shadowStatements} from './import-plan.mjs';
import {readFileSync} from 'node:fs';
const password=await hash('Synthetic-test-only-password',4);
const fixture=(n=1,extra={})=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,email:`test-${n}@example.invalid`,encrypted_password:password,email_confirmed_at:'2026-11-01T00:00:00Z',phone:null,phone_confirmed_at:null,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',banned_until:null,deleted_at:null,is_anonymous:false,is_sso_user:false,raw_user_meta_data:{role:'admin'},raw_app_meta_data:{role:'super_admin'},...extra});
const schema=readFileSync(new URL('../../workers/auth-preview/schema.sql',import.meta.url),'utf8').split('-- Explicit sandbox marker')[0];
test('account plan preserves credential/identity/verification/ban/metadata without metadata privileges',()=>{
 const source=fixture(1,{email_confirmed_at:null,banned_until:'2099-01-01T00:00:00Z'}),mapped=mapMigrationAccount(source);
 assert.equal(mapped.account.password,source.encrypted_password);assert.equal(mapped.user.id,source.id);assert.equal(mapped.user.emailVerified,0);assert.equal(mapped.user.banned,1);assert.equal(mapped.user.role,'user');assert.deepEqual(JSON.parse(mapped.metadata).raw_user_meta_data,source.raw_user_meta_data);assert.ok(!mapped.metadata.includes(password));
});
test('unsupported phone, anonymous, SSO, removed, unrecognized fields/hashes and ambiguous emails fail closed',()=>{
 for(const extra of [{phone:'+123456789'},{is_anonymous:true},{is_sso_user:true},{deleted_at:'2026-11-01'},{encrypted_password:'unrecognized'},{email:'TEST@example.invalid'},{new_field:true},{updated_at:'bad'}])assert.throws(()=>mapMigrationAccount(fixture(1,extra)));
});
test('shadow plan has no serving marker/session and native-style atomic failure preserves empty database',()=>{
 const db=new DatabaseSync(':memory:');try {
 const account=mapMigrationAccount(fixture());const plan={accounts:[account],records:1,sourceSha256:'a'.repeat(64)},statements=shadowStatements(plan,schema);
 const run=items=>{db.exec('BEGIN');try{for(const x of items){if(!x.params.length)db.exec(x.sql);else db.prepare(x.sql).run(...x.params);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
 assert.throws(()=>run([...statements,{sql:'INSERT INTO missing_table VALUES(1)',params:[]}]))
 assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 run(statements);assert.equal(db.prepare('SELECT state FROM _auth_shadow_manifest').get().state,'sealed');assert.equal(db.prepare('SELECT count(*) n FROM session').get().n,0);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='_auth_preview_manifest'").get().n,0);
 }finally{db.close();}
});
test('protected export requires checksum, owner-only permissions, current expiry and complete counts',async t=>{
 const {mkdtempSync,writeFileSync,chmodSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createHash}=await import('node:crypto');const {readProtectedExport}=await import('./import-plan.mjs');
 const folder=mkdtempSync(join(tmpdir(),'auth-export-test-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));const path=join(folder,'export.jsonl');const now=Date.parse('2026-11-06T12:00:00Z');
 const make=(updates={})=>{const records=[{kind:'meta',source:'approved-private-auth-view-v1',reader:'d1_migration_reader_20261022',captured_at:'2026-11-06T11:00:00Z',expiry:'2026-11-12T10:00:00Z',records:1,auth_ids:1,...updates},{kind:'user',row:fixture()}];const text=records.map(x=>JSON.stringify(x)+'\n').join('');writeFileSync(path,text+JSON.stringify({kind:'footer',sha256:createHash('sha256').update(text).digest('hex'),records:1})+'\n',{mode:0o600});chmodSync(path,0o600);};
 make();assert.equal(readProtectedExport(path,now).records,1);
 chmodSync(path,0o644);assert.throws(()=>readProtectedExport(path,now));
 for(const changes of [{reader:'another'},{expiry:'2026-11-01T00:00:00Z'},{captured_at:'2026-11-01T00:00:00Z'},{auth_ids:2},{records:2}]){make(changes);assert.throws(()=>readProtectedExport(path,now));}
 make();writeFileSync(path,readFileSync(path,'utf8').replace('test-1@example.invalid','tampered@example.invalid'));assert.throws(()=>readProtectedExport(path,now));
});
