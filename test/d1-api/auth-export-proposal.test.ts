import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
const reader='d1_migration_reader_20261022';
const original=readFileSync('d1/auth-reader-proposal-2026-11-03.sql','utf8');
const proposal=(approved=true)=>original.replaceAll('2026-11-05','2099-11-05').replaceAll('__APPROVE_AUTH_EXPORT_20261103__',approved?'approved-auth-export-v1':'__APPROVE_AUTH_EXPORT_20261103__');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;REVOKE CREATE ON SCHEMA public FROM PUBLIC;CREATE ROLE ${reader} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS CONNECTION LIMIT 3 VALID UNTIL '2099-11-05 10:00:00+00';CREATE SCHEMA d1_migration;COMMENT ON SCHEMA d1_migration IS 'pmrfp-d1-change-capture-v1; reviewed 2026-10-31';GRANT USAGE ON SCHEMA d1_migration TO ${reader};CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,encrypted_password text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz,created_at timestamptz,updated_at timestamptz,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean,is_sso_user boolean,raw_user_meta_data jsonb,raw_app_meta_data jsonb,recovery_token text);CREATE TABLE auth.sessions(secret text);CREATE TABLE public.items(id integer);GRANT SELECT ON public.items TO ${reader};INSERT INTO auth.users(id,email,encrypted_password,recovery_token) VALUES('00000000-0000-4000-8000-000000000001','fixture@example.invalid','SYNTHETIC_HASH','NEVER_EXPORT_TOKEN');`);
 return db;
}
it('requires approval and grants only the expiring selected Auth view',async()=>{
 const db=await fixture();try{
  await expect(db.exec(proposal(false))).rejects.toThrow('requires approval');await db.exec('ROLLBACK');
  const before=(await db.query(`SELECT rolvaliduntil,rolconfig FROM pg_roles WHERE rolname='${reader}'`)).rows;
  await db.exec(proposal());
  expect((await db.query(`SELECT rolvaliduntil,rolconfig FROM pg_roles WHERE rolname='${reader}'`)).rows).toEqual(before);
  await db.exec('SET ROLE '+reader);
  const rows=(await db.query<{encrypted_password:string}>('SELECT * FROM d1_migration.auth_export_v1')).rows;
  expect(rows).toHaveLength(1);expect(rows[0].encrypted_password).toBe('SYNTHETIC_HASH');expect(JSON.stringify(rows)).not.toContain('NEVER_EXPORT_TOKEN');
  await expect(db.query('SELECT encrypted_password FROM auth.users')).rejects.toThrow('permission denied');
  await expect(db.query('SELECT * FROM auth.sessions')).rejects.toThrow('permission denied');
  await expect(db.exec("UPDATE d1_migration.auth_export_v1 SET email='changed@example.invalid'")).rejects.toThrow('permission denied');
  await expect(db.exec('INSERT INTO public.items VALUES(1)')).rejects.toThrow('permission denied');
  await db.exec('RESET ROLE');
  for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);await expect(db.query('SELECT * FROM d1_migration.auth_export_v1')).rejects.toThrow('permission denied');await db.exec('RESET ROLE');}
  await expect(db.exec(proposal())).rejects.toThrow('already exists');await db.exec('ROLLBACK');
  expect((await db.query('SELECT email,recovery_token FROM auth.users')).rows[0]).toEqual({email:'fixture@example.invalid',recovery_token:'NEVER_EXPORT_TOKEN'});
 }finally{await db.close();}
});
it('refuses changed reader or exposed private schema; hard expiry hides exported rows',async()=>{
 const db=await fixture();try{
  await db.exec(`ALTER ROLE ${reader} INHERIT`);await expect(db.exec(proposal())).rejects.toThrow('Reader boundary changed');await db.exec('ROLLBACK');
  await db.exec(`ALTER ROLE ${reader} NOINHERIT;GRANT USAGE ON SCHEMA d1_migration TO authenticated`);await expect(db.exec(proposal())).rejects.toThrow('application access');await db.exec('ROLLBACK');
  await db.exec('REVOKE USAGE ON SCHEMA d1_migration FROM authenticated');
  // Keep the role valid, but move only the view's hard cutoff into the past.
  const expired=proposal().replace("clock_timestamp() < '2099-11-05 10:00:00+00'","clock_timestamp() < '2000-11-05 10:00:00+00'");
  await db.exec(expired);await db.exec('SET ROLE '+reader);
  expect((await db.query('SELECT * FROM d1_migration.auth_export_v1')).rows).toEqual([]);
 }finally{await db.close();}
});
