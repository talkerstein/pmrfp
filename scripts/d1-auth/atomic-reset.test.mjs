import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { compare } from 'bcryptjs';
import { resetSyntheticPassword } from './atomic-reset.mjs';
const token='synthetic_reset_token_0001', password='New-synthetic-password-2026', uid='00000000-0000-4000-8000-000000000001';
function setup(t) {
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(readFileSync(new URL('../../workers/auth-preview/schema.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run(uid,'Test','reset@example.invalid',1,1,1);
 db.prepare('INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)').run('credential:'+uid,uid,'credential',uid,'old-hash',1,1);
 db.prepare('INSERT INTO session(id,token,userId,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run('session','old-cookie',uid,'2099-01-01T00:00:00.000Z',1,1);
 db.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run('verification','reset-password:'+token,uid,'2099-01-01T00:00:00.000Z',1,1);
 const binding={prepare:(sql)=>({bind:(...params)=>({sql,params})}),batch:async statements=>{db.exec('BEGIN IMMEDIATE');try {for(const s of statements)db.prepare(s.sql).run(...s.params);db.exec('COMMIT');return [];}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {db,binding};
}
const state=db=>JSON.stringify(['account','session','verification','_auth_preview_manifest'].map(table=>db.prepare(`SELECT * FROM ${table}`).all()));
test('reset consumes one token, changes credential and revokes all sessions together',async t=>{
 const {db,binding}=setup(t);await resetSyntheticPassword(binding,token,password);
 assert.ok(await compare(password,db.prepare('SELECT password FROM account').get().password));
 assert.equal(db.prepare('SELECT count(*) n FROM session').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM verification').get().n,0);
 const before=state(db);await assert.rejects(resetSyntheticPassword(binding,token,'Another-password-2026'));assert.equal(state(db),before);
});
test('credential write failure preserves token, old credential and sessions for retry',async t=>{
 const {db,binding}=setup(t);db.exec("CREATE TRIGGER fail_reset BEFORE UPDATE ON account BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");const before=state(db);
 await assert.rejects(resetSyntheticPassword(binding,token,password));assert.equal(state(db),before);
 db.exec('DROP TRIGGER fail_reset');await resetSyntheticPassword(binding,token,password);
});
test('expired, duplicate, foreign-user and missing tokens cannot change any state',async t=>{
 for(const kind of ['expired','duplicate','foreign','missing']){
 const {db,binding}=setup(t);
 if(kind==='expired')db.exec('UPDATE verification SET expiresAt=0');
 if(kind==='duplicate')db.exec("INSERT INTO verification SELECT 'duplicate',identifier,value,expiresAt,createdAt,updatedAt FROM verification");
 if(kind==='foreign')db.exec("UPDATE user SET email='real@example.com'");
 if(kind==='missing')db.exec('DELETE FROM verification');
 const before=state(db);await assert.rejects(resetSyntheticPassword(binding,token,password));assert.equal(state(db),before);
 }
});
test('rejects oversized UTF-8 and malformed inputs before touching D1',async()=>{
 const db={prepare(){throw Error('MUST_NOT_QUERY');}};
 for(const [value,pw] of [['bad',password],[token,'short'],[token,'é'.repeat(37)]])await assert.rejects(resetSyntheticPassword(db,value,pw),/Invalid reset input/);
});
