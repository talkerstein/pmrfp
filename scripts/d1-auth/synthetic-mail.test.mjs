import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {hash} from 'bcryptjs';
import {rehearsalOptions,importSyntheticFixtures} from './rehearsal.mjs';
import {syntheticMailOptions,recordSyntheticMail} from './synthetic-mail.mjs';
const origin='http://localhost:8788',password='Synthetic-password-before-reset';
const userId='00000000-0000-4000-8000-000000000011',email='mail-fixture@example.invalid';
async function setup(t,verified=true,expiresIn=900){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const messages=[];
 const options=syntheticMailOptions(rehearsalOptions(db,randomBytes(32).toString('hex')),{origin,deliver:async m=>messages.push(m)});
 options.emailVerification.expiresIn=expiresIn;
 await(await getMigrations(options)).runMigrations();
 importSyntheticFixtures(db,[{id:userId,email,encrypted_password:await hash(password,4),email_confirmed_at:verified?'2026-11-01T00:00:00Z':null,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z'}]);
 const auth=betterAuth(options);
 const request=(path,body,cookie)=>auth.handler(new Request(origin+'/api/auth/'+path,{method:body?'POST':'GET',headers:{origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 return {db,messages,request};
}
test('actual verification callback generates a same-origin link; verification allows sign-in without auto-session',async t=>{
 const {request,messages,db}=await setup(t,false);
 assert.equal((await request('sign-in/email',{email,password})).status,403);
 assert.equal((await request('send-verification-email',{email,callbackURL:'/'})).status,200);
 assert.equal(messages.length,1);assert.equal(messages[0].kind,'verification');assert.equal(messages[0].to,email);
 const link=new URL(messages[0].url);
 assert.equal((await request('verify-email'+link.search)).status,302);
 assert.equal(db.prepare('SELECT emailVerified FROM user').get().emailVerified,1);
 assert.equal(db.prepare('SELECT count(*) n FROM session').get().n,0);
 assert.equal((await request('sign-in/email',{email,password})).status,200);
});
test('expired verification cannot confirm an account',async t=>{
 const {request,messages,db}=await setup(t,false,-1);
 await request('send-verification-email',{email});const link=new URL(messages[0].url);
 const response=await request('verify-email'+link.search);
 assert.ok(response.status>=300);assert.equal(db.prepare('SELECT emailVerified FROM user').get().emailVerified,0);
});
test('actual reset callback token changes password, revokes sessions and rejects replay; missing accounts emit no mail',async t=>{
 const {request,messages,db}=await setup(t);
 const signed=await request('sign-in/email',{email,password});assert.equal(signed.status,200);
 const cookie=signed.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 assert.equal((await request('request-password-reset',{email,redirectTo:origin+'/reset'})).status,200);
 assert.equal(messages.length,1);assert.equal(messages[0].kind,'reset');
 const token=new URL(messages[0].url).pathname.split('/').at(-1),newPassword='Synthetic-password-after-reset';
 assert.equal((await request('reset-password',{token,newPassword})).status,200);
 assert.equal(await(await request('get-session',null,cookie)).json(),null);
 assert.equal((await request('reset-password',{token,newPassword:'Different-password-2026'})).status,400);
 assert.equal((await request('sign-in/email',{email,password})).status,401);
 assert.equal((await request('sign-in/email',{email,password:newPassword})).status,200);
 assert.equal((await request('request-password-reset',{email:'missing@example.invalid'})).status,200);assert.equal(messages.length,1);
 assert.equal(db.prepare("SELECT count(*) n FROM verification WHERE identifier LIKE 'reset-password:%'").get().n,0);
});
test('mail contract rejects customer addresses, foreign origins and redirect links',async()=>{
 const delivered=[];const config=syntheticMailOptions({},{origin,deliver:async x=>delivered.push(x)});
 const token='synthetic_reset_token_0001',url=origin+'/api/auth/reset-password/'+token;
 for(const data of [{user:{id:userId,email:'customer@example.com'},token,url},{user:{id:userId,email},token,url:'https://evil.invalid/api/auth/reset-password/'+token},{user:{id:userId,email},token,url:url+'?callbackURL=https://evil.invalid'}])await assert.rejects(config.emailAndPassword.sendResetPassword(data));
 assert.equal(delivered.length,0);
});
test('outbox replaces only the same fixture/kind and rolls back on wrong recipient',async t=>{
 const {db}=await setup(t);db.exec("CREATE TABLE _auth_preview_manifest(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT CHECK(mode='synthetic-only-v1')); INSERT INTO _auth_preview_manifest VALUES(1,'synthetic-only-v1')");
 const binding={prepare:sql=>({bind:(...params)=>({sql,params})}),batch:async statements=>{db.exec('BEGIN');try{for(const s of statements)db.prepare(s.sql).run(...s.params);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
 const message={kind:'reset',userId,to:email,url:origin+'/synthetic',expiresIn:900};
 await recordSyntheticMail(binding,message);await recordSyntheticMail(binding,{...message,url:origin+'/replacement'});
 assert.equal(db.prepare('SELECT count(*) n FROM verification').get().n,1);
 const before=JSON.stringify(db.prepare('SELECT * FROM verification').all());
 await assert.rejects(recordSyntheticMail(binding,{...message,to:'customer@example.com'}));assert.equal(JSON.stringify(db.prepare('SELECT * FROM verification').all()),before);
});
test('an expired token produced by the reset callback cannot change credentials or revoke a current session',async t=>{
 const {request,messages,db}=await setup(t);
 const signed=await request('sign-in/email',{email,password});const cookie=signed.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 await request('request-password-reset',{email});const token=new URL(messages[0].url).pathname.split('/').at(-1);
 db.prepare('UPDATE verification SET expiresAt=0 WHERE identifier=?').run('reset-password:'+token);
 assert.equal((await request('reset-password',{token,newPassword:'Expired-must-not-apply'})).status,400);
 assert.equal((await(await request('get-session',null,cookie)).json()).user.id,userId);
 assert.equal((await request('sign-in/email',{email,password})).status,200);
});
