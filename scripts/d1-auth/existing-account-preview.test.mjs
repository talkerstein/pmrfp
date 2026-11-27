import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {existingTestAccountStatements} from './existing-account-plan.mjs';
import worker from './existing-account-worker.mjs';
const uid='12345678-1234-4234-8234-123456789012',email='d1-preview-20261022@example.invalid',key='synthetic-preview-key-at-least-32-characters';
const account={user:{id:uid,email,name:'',emailVerified:1,role:'user',banned:0,banExpires:null,createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z'},account:{id:'credential:'+uid,accountId:uid,userId:uid,providerId:'credential',password:'$2b$04$'+'A'.repeat(53)}};
const schema=readFileSync(new URL('../../workers/auth-preview/schema.sql',import.meta.url),'utf8');
test('prepared import copies exactly the existing test identity, never customers or sessions',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const plan={sourceSha256:'a'.repeat(64),accounts:[account,{...account,user:{...account.user,id:'other',email:'customer@example.com'}}]};
 const statements=existingTestAccountStatements(plan,uid,schema);db.exec('BEGIN');for(const s of statements)db.prepare(s.sql).run(...s.params);db.exec('COMMIT');
 assert.equal(db.prepare('SELECT count(*) n FROM user').get().n,1);assert.equal(db.prepare('SELECT email FROM user').get().email,email);assert.equal(db.prepare('SELECT count(*) n FROM session').get().n,0);assert.equal(db.prepare('SELECT mode FROM _auth_test_preview_manifest').get().mode,'existing-test-account-only');
 for(const extra of [{emailVerified:0},{banned:1},{role:'admin'}])assert.throws(()=>existingTestAccountStatements({...plan,accounts:[{...account,user:{...account.user,...extra}}]},uid,schema));
 assert.throws(()=>existingTestAccountStatements(plan,'unmatched',schema));
});
const origin='https://pmrfp-existing-test-auth-preview.pmrfp.workers.dev';
const env=db=>({AUTH_DB:db,AUTH_SECRET:'synthetic-auth-secret-at-least-32-characters',GATEWAY_SECRET:key,MODE:'existing-test-account-only'});
const database=(users=[account.user],mode='existing-test-account-only')=>({prepare:()=>({first:async()=>({mode,user_id:uid,expires_at:new Date(Date.now()+600000).toISOString()}),all:async()=>({results:users})})});
const request=(path='/__migration/health',body,keyValue=key)=>new Request(origin+path,{method:body?'POST':'GET',headers:{'x-pmrfp-auth-preview-key':keyValue,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('prepared serving worker denies wrong gateway before reading private data',async()=>{
 assert.equal((await worker.fetch(request('/__migration/health',null,'wrong'),env({prepare(){throw Error('MUST_NOT_READ');}}))).status,401);
});
test('only one approved test identity with current verification and ban state can serve',async()=>{
 for(const db of [database([]),database([account.user,account.user]),database([{...account.user,email:'customer@example.com'}]),database([{...account.user,banned:1,banExpires:'2099-01-01T00:00:00Z'}]),database([account.user],'sealed')])assert.equal((await worker.fetch(request(),env(db))).status,503);
 const good=await worker.fetch(request(),env(database()));assert.equal(good.status,200);assert.deepEqual(await good.json(),{mode:'existing-test-account-only',customerAccounts:0});
});
test('customer credentials, signup, reset, admin paths and arbitrary fields are unavailable',async()=>{
 for(const path of ['/api/auth/sign-up/email','/api/auth/request-password-reset','/api/auth/admin/list-users','/api/auth/get-session?unexpected=1'])assert.equal((await worker.fetch(request(path,{}),env(database()))).status,404);
 for(const body of [{email:'customer@example.com',password:'example'},{email,password:'example',callbackURL:'https://evil.invalid'},{email,password:'é'.repeat(37)}])assert.equal((await worker.fetch(request('/api/auth/sign-in/email',body),env(database()))).status,400);
});

test('the serving rehearsal expires independently of the session cookie',async()=>{
 const db={prepare:()=>({first:async()=>({mode:'existing-test-account-only',user_id:uid,expires_at:'2000-01-01T00:00:00.000Z'}),all:async()=>({results:[account.user]})})};
 assert.equal((await worker.fetch(request(),env(db))).status,503);
});
