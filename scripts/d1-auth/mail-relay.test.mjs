import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relaySyntheticMail} from './mail-relay.mjs';
const env={MAIL_RELAY_MODE:'synthetic-capture',MAIL_RELAY_SECRET:'synthetic-gateway-key-at-least-32-characters',MAIL_RELAY_OIDC:'synthetic-oidc-token-at-least-32-characters'};
test('relay is disabled by default and never requests arbitrary origins',async()=>{
 let calls=0;await relaySyntheticMail({}, {},async()=>{calls++;});assert.equal(calls,0);
 await relaySyntheticMail({kind:'reset'},env,async function(url,options){assert.equal(this,globalThis);calls++;assert.equal(url,'https://pmrfp-git-codex-d1-staged-migration-talkersteins-projects.vercel.app/api/migration/auth-mail');assert.equal(options.redirect,'manual');assert.equal(options.headers['x-vercel-trusted-oidc-idp-token'],env.MAIL_RELAY_OIDC);return Response.json({validated:true,emailsSent:0,mode:'synthetic-capture'});});assert.equal(calls,1);
});
test('missing credentials, denied response, unexpected sending and provider errors fail closed',async()=>{
 await assert.rejects(relaySyntheticMail({}, {...env,MAIL_RELAY_SECRET:''},()=>{throw Error('MUST_NOT_FETCH');}));
 for(const response of [new Response(null,{status:302,headers:{location:'https://evil.invalid'}}),new Response('private-provider-detail',{status:401}),Response.json({validated:true,emailsSent:1,mode:'synthetic-capture'}),Response.json({validated:true,emailsSent:0,mode:'sending'}),new Response('x'.repeat(1025))])await assert.rejects(relaySyntheticMail({},env,async()=>response),/^Error: Synthetic mail relay failed$/);
});
