import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hash } from 'bcryptjs';
import { createRehearsal, importSyntheticFixtures, mapSyntheticSource } from './rehearsal.mjs';

const password = 'Synthetic-fixture-only-2026';
const passwordHash = await hash(password, 4);
const fixture = (n, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,
  email: `migration-${n}@example.invalid`, encrypted_password: passwordHash,
  email_confirmed_at: '2026-11-02T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...extra,
});
async function setup(t, rows) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  const auth = await createRehearsal(db, randomBytes(32).toString('hex'));
  importSyntheticFixtures(db, rows);
  const request = (path, body, cookie) => auth.handler(new Request(`http://localhost:8788/api/auth/${path}`, {
    method: body ? 'POST' : 'GET', headers: { ...(body ? {'content-type':'application/json',origin:'http://localhost:8788'} : {}), ...(cookie ? {cookie} : {}) },
    ...(body ? {body:JSON.stringify(body)} : {}),
  }));
  return {db, request};
}

test('imported bcrypt credential signs in with the original UUID and never exposes its hash', async t => {
  const row = fixture(1); const {db,request} = await setup(t,[row]);
  const response = await request('sign-in/email',{email:row.email,password});
  assert.equal(response.status,200);
  const result = await response.json(); assert.equal(result.user.id,row.id); assert.equal(result.user.role,'user');
  assert.ok(!JSON.stringify(result).includes(passwordHash));
  assert.equal(db.prepare('SELECT password FROM account WHERE userId=?').get(row.id).password,passwordHash);
  const cookie = response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  const session = await request('get-session',null,cookie); assert.equal((await session.json()).user.id,row.id);
  assert.equal((await request('sign-out',{},cookie)).status,200);
  assert.equal(await (await request('get-session',null,cookie)).json(),null);
});

test('wrong password, unverified email and active ban cannot create a session', async t => {
  const rows = [fixture(2),fixture(3,{email_confirmed_at:null}),fixture(4,{banned_until:'2099-01-01T00:00:00Z'})];
  const {db,request} = await setup(t,rows);
  for (const [row,pw] of [[rows[0],'wrong-password'],[rows[1],password],[rows[2],password]]) {
    const response = await request('sign-in/email',{email:row.email,password:pw});
    assert.ok(response.status>=400 && response.status<500);
    assert.equal(db.prepare('SELECT count(*) AS n FROM session').get().n,0);
  }
});

test('expired bans permit sign-in; editable metadata cannot grant admin', async t => {
  const row = fixture(5,{banned_until:'2020-01-01T00:00:00Z',raw_user_meta_data:{role:'admin'},raw_app_meta_data:{role:'admin'}});
  const {request} = await setup(t,[row]);
  const response=await request('sign-in/email',{email:row.email,password});
  assert.equal(response.status,200);assert.equal((await response.json()).user.role,'user');
});

test('duplicate fixture import rolls back every inserted user and account', async t => {
  const {db}=await setup(t,[]);
  assert.throws(()=>importSyntheticFixtures(db,[fixture(6),fixture(6)]));
  assert.equal(db.prepare('SELECT count(*) AS n FROM user').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM account').get().n,0);
});

test('rehearsal refuses real emails, deleted accounts, unknown hashes and malformed dates', () => {
  for (const extra of [{email:'real@example.com'},{deleted_at:'2026-11-01T00:00:00Z'},{encrypted_password:'unrecognized'},{updated_at:'invalid'},{is_sso_user:true},{is_anonymous:true}]) {
    assert.throws(()=>mapSyntheticSource(fixture(7,extra)));
  }
});
