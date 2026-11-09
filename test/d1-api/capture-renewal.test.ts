import { PGlite } from '@electric-sql/pglite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
const reader='d1_migration_reader_20261022';
const catalog={columns:[{table_name:'items',column_name:'id'}],constraints:[{table_name:'items',type:'p',definition:'PRIMARY KEY (id)'}]};
const python=(module:string)=>execFileSync('python3',['-c',`import sys,json;sys.path.insert(0,'scripts/d1');import ${module} as x;print(x.generate(json.load(sys.stdin),expires='2026-11-05 10:00:00+00') if '${module}'=='change_capture' else x.generate(json.load(sys.stdin)))`],{input:JSON.stringify(catalog),encoding:'utf8'});
const renewal=(approved=true)=>python('renew_capture_access').replaceAll('2026-11-12','2099-11-12').replaceAll('__APPROVE_CAPTURE_RENEWAL_20261105__',approved?'approved-capture-renewal-v1':'__APPROVE_CAPTURE_RENEWAL_20261105__');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;REVOKE CREATE ON SCHEMA public FROM PUBLIC;CREATE ROLE ${reader} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS CONNECTION LIMIT 3 VALID UNTIL '2026-11-05 10:00:00+00';CREATE TABLE items(id uuid PRIMARY KEY,body text);GRANT SELECT ON items TO ${reader};CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,encrypted_password text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz,created_at timestamptz,updated_at timestamptz,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean,is_sso_user boolean,raw_user_meta_data jsonb,raw_app_meta_data jsonb);INSERT INTO items VALUES('00000000-0000-4000-8000-000000000001','UNCHANGED');INSERT INTO auth.users(id,email,encrypted_password) VALUES('00000000-0000-4000-8000-000000000001','fixture@example.invalid','SYNTHETIC_HASH');`);
 // Reconstruct the already installed historical setup, whose login is now expired.
 const install=python('change_capture').replaceAll('__APPROVE_D1_CHANGE_CAPTURE_20261031__','approved-d1-change-capture-v1').replaceAll('rolvaliduntil>clock_timestamp() AND ','');
 await db.exec(install);
 await db.exec(readFileSync('d1/auth-reader-proposal-2026-11-03.sql','utf8').replaceAll('__APPROVE_AUTH_EXPORT_20261103__','approved-auth-export-v1'));
 return db;
}
it('renews only the existing duration, preserves ACLs/data, and restores bounded ACK/Auth reads',async()=>{
 const db=await fixture();try{
  const before=(await db.query('SELECT * FROM items')).rows;
  const acl=(await db.query("SELECT relacl FROM pg_class WHERE oid='d1_migration.auth_export_v1'::regclass")).rows;
  await expect(db.exec(renewal(false))).rejects.toThrow('requires approval');await db.exec('ROLLBACK');
  await db.exec(renewal());
  expect((await db.query('SELECT * FROM items')).rows).toEqual(before);
  expect((await db.query("SELECT relacl FROM pg_class WHERE oid='d1_migration.auth_export_v1'::regclass")).rows).toEqual(acl);
  expect((await db.query(`SELECT rolvaliduntil='2099-11-12 10:00:00+00'::timestamptz AS renewed FROM pg_roles WHERE rolname='${reader}'`)).rows[0]).toEqual({renewed:true});
  await db.exec("INSERT INTO items VALUES('00000000-0000-4000-8000-000000000002','CAPTURED')");
  await db.exec('SET ROLE '+reader);
  expect((await db.query('SELECT id FROM d1_migration.auth_export_v1')).rows).toHaveLength(1);
  expect((await db.query(`SELECT d1_migration.acknowledge(ARRAY[1]::bigint[],'${'a'.repeat(64)}') AS count`)).rows[0]).toEqual({count:1});
  await expect(db.exec("UPDATE items SET body='DENIED'")).rejects.toThrow('permission denied');
  await expect(db.query('SELECT encrypted_password FROM auth.users')).rejects.toThrow('permission denied');
  await db.exec('RESET ROLE;SET ROLE authenticated');await expect(db.query('SELECT * FROM d1_migration.auth_export_v1')).rejects.toThrow('permission denied');
 }finally{await db.close();}
});
it('rejects changed Auth definitions before extending access',async()=>{
 const db=await fixture();try{
  // Alter only the expiry predicate while retaining all columns, ACL and marker.
  const definition=(await db.query<{definition:string}>("SELECT pg_get_viewdef('d1_migration.auth_export_v1'::regclass,true) AS definition")).rows[0].definition;
  await db.exec('CREATE OR REPLACE VIEW d1_migration.auth_export_v1 WITH(security_barrier=true) AS '+definition.replace('clock_timestamp()',"'2000-01-01'::timestamptz"));
  await expect(db.exec(renewal())).rejects.toThrow('Auth view definition changed');await db.exec('ROLLBACK');
  expect((await db.query(`SELECT rolvaliduntil='2026-11-05 10:00:00+00'::timestamptz AS unchanged FROM pg_roles WHERE rolname='${reader}'`)).rows[0]).toEqual({unchanged:true});
 }finally{await db.close();}
});
it('rejects a replaced ACK body without executing it or changing the expiry',async()=>{
 const db=await fixture();try{
  await db.exec("CREATE OR REPLACE FUNCTION d1_migration.acknowledge(p_ids bigint[],p_destination_sha256 text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN UPDATE public.items SET body='MUST_NOT_RUN';RETURN 0;END $$");
  await expect(db.exec(renewal())).rejects.toThrow('Reviewed queue functions changed');await db.exec('ROLLBACK');
  expect((await db.query('SELECT body FROM items')).rows).toEqual([{body:'UNCHANGED'}]);
 }finally{await db.close();}
});
