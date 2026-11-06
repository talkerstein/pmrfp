import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';

const fields=['id','email','encrypted_password','email_confirmed_at','phone','phone_confirmed_at','created_at','updated_at','banned_until','deleted_at','is_anonymous','is_sso_user','raw_user_meta_data','raw_app_meta_data'].sort();
const parse=text=>{try{return JSON.parse(text);}catch{throw Error('Invalid protected export JSON');}};
const date=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('Invalid source date');return Date.parse(value);};
/** Pure mapper. Application privileges come from the application profile, never metadata. */
export function mapMigrationAccount(row,now=Date.now()) {
 if(!row || Object.keys(row).sort().join()!==fields.join()
   || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.id)
   || typeof row.email!=='string' || row.email.length>320 || row.email!==row.email.toLowerCase() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)
   || typeof row.encrypted_password!=='string' || !/^\$2[aby]\$(0[4-9]|1[0-6])\$[./A-Za-z0-9]{53}$/.test(row.encrypted_password)
   || row.phone || row.phone_confirmed_at || row.deleted_at || row.is_anonymous!==false || row.is_sso_user!==false
   || !Number.isSafeInteger(now))throw Error('Unsupported source account');
 const ban=row.banned_until===null?null:date(row.banned_until);
 return {user:{id:row.id,email:row.email,name:'',emailVerified:row.email_confirmed_at===null?0:(date(row.email_confirmed_at),1),createdAt:new Date(date(row.created_at)).toISOString(),updatedAt:new Date(date(row.updated_at)).toISOString(),role:'user',banned:ban!==null&&ban>now?1:0,banExpires:ban===null?null:new Date(ban).toISOString()},
 account:{id:'credential:'+row.id,accountId:row.id,providerId:'credential',userId:row.id,password:row.encrypted_password},
 // Preserve approved source metadata without trusting it as a role or duplicating the hash.
 metadata:JSON.stringify({raw_user_meta_data:row.raw_user_meta_data,raw_app_meta_data:row.raw_app_meta_data})};
}

/** Reads a checksummed, owner-only export; never prints account data or hashes. */
export function readProtectedExport(path,now=Date.now()) {
 const info=lstatSync(path);
 if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0||info.size>4_000_000)throw Error('Protected export file required');
 const bytes=readFileSync(path),lines=bytes.toString('utf8').split('\n');
 if(lines.pop()!=='')throw Error('Incomplete export');
 const footer=parse(lines.pop()),header=parse(lines[0]);
 const digest=createHash('sha256').update(lines.join('\n')+'\n').digest('hex');
 if(footer.kind!=='footer'||footer.sha256!==digest||header.kind!=='meta'||header.source!=='approved-private-auth-view-v1'||header.reader!=='d1_migration_reader_20261022'
   ||!Number.isSafeInteger(header.records)||header.records<1||header.records>1000||header.records!==footer.records||header.auth_ids!==header.records||lines.length!==header.records+1
   ||date(header.captured_at)>now+60_000||now-date(header.captured_at)>86_400_000||date(header.expiry)<=now)throw Error('Invalid, expired or stale export');
 const accounts=lines.slice(1).map(line=>{const item=parse(line);if(item.kind!=='user'||Object.keys(item).sort().join()!=='kind,row')throw Error('Invalid export record');return mapMigrationAccount(item.row,now);});
 if(new Set(accounts.map(x=>x.user.id)).size!==accounts.length||new Set(accounts.map(x=>x.user.email)).size!==accounts.length)throw Error('Duplicate source account');
 return {sourceSha256:digest,accounts,records:accounts.length};
}

/** Plan only: install into a NEW unbound database; no synthetic marker or login deployment. */
export function shadowStatements(plan,schema) {
 if(!plan?.accounts?.length||plan.records!==plan.accounts.length||!/^[a-f0-9]{64}$/.test(plan.sourceSha256)||schema.includes('_auth_preview_manifest'))throw Error('Invalid sealed import plan');
 const statements=[...schema.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n').split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>({sql,params:[]})),
 {sql:'CREATE TABLE _auth_source_metadata(user_id TEXT PRIMARY KEY REFERENCES user(id),metadata TEXT NOT NULL)',params:[]},
 {sql:"CREATE TABLE _auth_shadow_manifest(id INTEGER PRIMARY KEY CHECK(id=1),state TEXT NOT NULL CHECK(state='sealed'),source_sha256 TEXT NOT NULL,records INTEGER NOT NULL)",params:[]}];
 for(const row of plan.accounts){
  const u=row.user,a=row.account;
  statements.push({sql:'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned,banExpires) VALUES(?,?,?,?,?,?,?,?,?)',params:[u.id,u.name,u.email,u.emailVerified,u.createdAt,u.updatedAt,u.role,u.banned,u.banExpires]},
   {sql:'INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',params:[a.id,a.accountId,a.providerId,a.userId,a.password,u.createdAt,u.updatedAt]},
   {sql:'INSERT INTO _auth_source_metadata VALUES(?,?)',params:[u.id,row.metadata]});
 }
 statements.push({sql:"INSERT INTO _auth_shadow_manifest VALUES(1,'sealed',?,?)",params:[plan.sourceSha256,plan.records]});
 if(Buffer.byteLength(JSON.stringify({batch:statements}))>3_500_000||statements.length>500)throw Error('Atomic shadow import exceeds transport bound');
 return statements;
}
