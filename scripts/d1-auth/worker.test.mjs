import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
const key='synthetic-gateway-key-for-fixtures-only';
const origin='https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev';
const env=(db)=>({AUTH_DB:db,GATEWAY_SECRET:key,AUTH_SECRET:'synthetic-test-auth-secret-at-least-32-characters',MODE:'synthetic-only',AUTH_BASE_URL:origin});
const request=(secret=key)=>new Request(origin+'/__migration/health',{headers:{'x-pmrfp-auth-preview-key':secret}});
test('gateway denial never touches the auth database',async()=>{
 const db={prepare(){throw Error('MUST_NOT_QUERY')}};
 const response=await worker.fetch(request('wrong'),env(db));assert.equal(response.status,401);
});
test('unmarked or non-synthetic data fails closed before auth handlers run',async()=>{
 const database = (mode,unsafe) => ({
   prepare(sql) {
     return { first: async () => sql.includes('_auth_preview_manifest') ? {mode} : {total:1,unsafe} };
   },
 });
 for(const db of [database('unrecognized',0),database('synthetic-only-v1',1)]){
  const response=await worker.fetch(request(),env(db));
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'synthetic_dataset_required');
 }
});
test('private health confirms only a bounded synthetic dataset',async()=>{
 const db={prepare:sql=>({first:async()=>sql.includes('_auth_preview_manifest')?{mode:'synthetic-only-v1'}:{total:4,unsafe:0}})};
 const response=await worker.fetch(request(),env(db));assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{mode:'synthetic-only',realAccountsImported:false});assert.equal(response.headers.get('cache-control'),'no-store');
});
test('wrong mode or origin never opens the database',async()=>{
 const db={prepare(){throw Error('MUST_NOT_QUERY')}};
 for(const config of [{...env(db),MODE:'production'},{...env(db),AUTH_BASE_URL:'https://another.invalid'}])assert.equal((await worker.fetch(request(),config)).status,503);
});
test('reset requires explicit mode, same origin, JSON and bounded reviewed fields',async()=>{
 const db={prepare:sql=>({first:async()=>sql.includes('_auth_preview_manifest')?{mode:'synthetic-only-v1'}:{total:4,unsafe:0}})};
 const send=(config,headers,body)=>worker.fetch(new Request(origin+'/api/auth/reset-password',{method:'POST',headers:{...headers,'x-pmrfp-auth-preview-key':key},body}),config);
 assert.equal((await send(env(db),{'content-type':'application/json',origin},'{}')).status,404);
 for(const [headers,body] of [[{'content-type':'application/json',origin:'https://evil.invalid'},'{}'],[{'content-type':'text/plain',origin},'{}'],[{'content-type':'application/json',origin},JSON.stringify({unknown:'field'})],[{'content-type':'application/json',origin},'x'.repeat(1025)]]){
  assert.equal((await send({...env(db),SYNTHETIC_RESET:'enabled'},headers,body)).status,400);
 }
});
test('signup is disabled by default and accepts only the reserved fixture without caller-supplied privileges', async () => {
  const db = { prepare: sql => ({ first: async () => sql.includes('_auth_preview_manifest')
    ? { mode: 'synthetic-only-v1' } : { total: 0, unsafe: null } }) };
  const body = { name: 'Fixture', email: 'profile-signup-19@example.invalid', password: 'fixture-password', role: 'trade', lang: 'fr' };
  const send = (config, fields, requestOrigin = origin) => worker.fetch(new Request(origin + '/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: requestOrigin, 'x-pmrfp-auth-preview-key': key },
    body: JSON.stringify(fields),
  }), config);
  assert.equal((await send(env(db), body)).status, 404);
  const capture = { ...env(db), SYNTHETIC_SIGNUP: 'capture-only' };
  for (const fields of [
    { ...body, email: 'different@example.invalid' },
    { ...body, role: 'super_admin' },
    { ...body, callbackURL: 'https://unexpected.invalid' },
    { ...body, password: 'é'.repeat(37) },
    { ...body, name: 'x'.repeat(1024) },
  ]) assert.equal((await send(capture, fields)).status, 400);
  assert.equal((await send(capture, body, 'https://unexpected.invalid')).status, 400);
});
