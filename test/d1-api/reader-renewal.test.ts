import { PGlite } from '@electric-sql/pglite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
it('renews only the reviewed reads, preserves credentials/app triggers, and rejects unapproved execution',async()=>{
 const db=new PGlite();
 try {
  const catalog=JSON.parse(readFileSync('d1/production-catalog-2026-10-29.json','utf8'));
  const tables=[...new Set<string>(catalog.columns.map((c:{table_name:string})=>c.table_name))];
  const additions=new Set(['blocked_domains','contractor_activity','open_data_runs','org_link_clicks','organization_risk','permit_leads','planned_procurements']);
  await db.exec("CREATE SCHEMA auth;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;REVOKE CREATE ON SCHEMA public FROM PUBLIC;CREATE TABLE auth.users(id uuid PRIMARY KEY,encrypted_password text);CREATE ROLE d1_migration_reader_20261022 LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS CONNECTION LIMIT 3 PASSWORD 'synthetic-local-test-only' VALID UNTIL '2026-10-29 10:00:00+00';GRANT USAGE ON SCHEMA public TO d1_migration_reader_20261022;");
  for(const t of tables){await db.exec(`CREATE TABLE public."${t}"(id text PRIMARY KEY)`);if(!additions.has(t))await db.exec(`GRANT SELECT ON public."${t}" TO d1_migration_reader_20261022`);}
  await db.exec("CREATE VIEW public.d1_migration_auth_ids_20261022 AS SELECT id FROM auth.users;REVOKE ALL ON public.d1_migration_auth_ids_20261022 FROM PUBLIC;GRANT SELECT ON public.d1_migration_auth_ids_20261022 TO d1_migration_reader_20261022;INSERT INTO blocked_domains VALUES('private-row');INSERT INTO auth.users VALUES('10000000-0000-4000-8000-000000000001','synthetic-secret');");
  for(const [name,args] of [['has_active_trade_access','uid uuid'],['has_intel_access','uid uuid'],['is_admin','uid uuid'],['is_org_member','uid uuid,org uuid']])await db.exec(`CREATE FUNCTION public.${name}(${args}) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT true $$;`);
  await db.exec("CREATE FUNCTION public.guard_organization_link_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN NEW; END $$;CREATE TRIGGER organizations_guard_link_fields BEFORE INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION guard_organization_link_fields();GRANT INSERT ON organizations TO authenticated;");
  catalog.functions=(await db.query("SELECT proname AS name,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")).rows;
  const sql=execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/d1');import renew_reader;print(renew_reader.generate(json.load(sys.stdin)))"],{input:JSON.stringify(catalog),encoding:'utf8'});
  const credential=(await db.query("SELECT rolpassword FROM pg_authid WHERE rolname='d1_migration_reader_20261022'")).rows;
  await expect(db.exec(sql)).rejects.toThrow('Review-only renewal');await db.exec('ROLLBACK');
  await db.exec(sql.replaceAll('__APPROVE_READER_RENEWAL_20261029__','approved-local-fixture'));
  expect((await db.query("SELECT rolpassword FROM pg_authid WHERE rolname='d1_migration_reader_20261022'")).rows).toEqual(credential);
  expect((await db.query("SELECT rolvaliduntil='2026-11-05 10:00:00+00'::timestamptz AS correct_expiry FROM pg_roles WHERE rolname='d1_migration_reader_20261022'")).rows[0]).toEqual({correct_expiry:true});
  await db.exec('SET ROLE d1_migration_reader_20261022');expect((await db.query('SELECT id FROM blocked_domains')).rows).toEqual([{id:'private-row'}]);
  expect((await db.query('SELECT id FROM d1_migration_auth_ids_20261022')).rows).toHaveLength(1);
  await expect(db.exec("INSERT INTO blocked_domains VALUES('forbidden')")).rejects.toThrow('permission denied');
  await expect(db.query('SELECT encrypted_password FROM auth.users')).rejects.toThrow('permission denied');
  await db.exec('CREATE TEMP TABLE reader_temp(id text)');await expect(db.exec('CREATE TRIGGER attach_definer BEFORE INSERT ON reader_temp FOR EACH ROW EXECUTE FUNCTION public.guard_organization_link_fields()')).rejects.toThrow('permission denied');
  await db.exec("RESET ROLE;SET ROLE authenticated;INSERT INTO organizations VALUES('ordinary-trigger-invocation');RESET ROLE");
  expect((await db.query('SELECT id FROM organizations')).rows).toEqual([{id:'ordinary-trigger-invocation'}]);
 } finally {await db.close();}
});
