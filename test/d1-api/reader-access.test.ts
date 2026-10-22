import { PGlite } from '@electric-sql/pglite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('provisions only reviewed reads, denies auth secrets/writes, and preserves app counter calls',async()=>{
  const db=new PGlite();
  try {
    const catalog=JSON.parse(readFileSync('d1/production-catalog-2026-10-22.json','utf8'));
    const tables=[...new Set<string>(catalog.columns.map((c:{table_name:string})=>c.table_name))];
    const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
    await db.exec("CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE TABLE auth.users(id uuid PRIMARY KEY,encrypted_password text);");
    for(const t of tables)await db.exec(`CREATE TABLE public.${quote(t)}(id text PRIMARY KEY)`);
    await db.exec("ALTER TABLE marketplace_listings ADD COLUMN views integer DEFAULT 0; ALTER TABLE marketplace_listings ADD COLUMN slug text; INSERT INTO users_profile VALUES('private-row'); ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY; INSERT INTO auth.users VALUES('10000000-0000-0000-0000-000000000001','not-a-real-password');");
    const helpers=[['has_active_trade_access','uid uuid'],['has_intel_access','uid uuid'],['is_admin','uid uuid'],['is_org_member','uid uuid,org uuid']];
    for(const [name,args] of helpers)await db.exec(`CREATE FUNCTION public.${name}(${args}) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT true $$;`);
    await db.exec("CREATE FUNCTION public.marketplace_increment_views(p_slug text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ UPDATE marketplace_listings SET views=views+1 WHERE slug=p_slug $$;");
    await db.exec("CREATE FUNCTION public.capture_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN UPDATE public.users_profile SET id='trigger-ran' WHERE id='private-row'; RETURN NEW; END $$; CREATE TRIGGER existing_trigger BEFORE INSERT ON public.rfp_posts FOR EACH ROW EXECUTE FUNCTION public.capture_trigger();");
    const preflight={public_definer_execute:(await db.query("SELECT n.nspname AS schema,p.proname AS name,format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef")).rows};
    catalog.functions=(await db.query("SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")).rows;
    const proposal=execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/d1');import reader_access;x=json.load(sys.stdin);print(reader_access.generate(x['catalog'],preflight=x['preflight']))"],{input:JSON.stringify({catalog,preflight}),encoding:'utf8'});
    await expect(db.exec(proposal)).rejects.toThrow('Review-only proposal');
    await db.exec('ROLLBACK');
    await db.exec(proposal.replaceAll('__GENERATE_PRIVATE_PASSWORD_AFTER_APPROVAL__','synthetic-not-a-production-password'));
    await db.exec(readFileSync('d1/reader-auth-id-view-2026-10-22.sql','utf8'));
    await db.exec('REVOKE USAGE ON SCHEMA auth FROM d1_migration_reader_20261022; SET ROLE d1_migration_reader_20261022');
    expect((await db.query('SELECT id FROM users_profile')).rows).toHaveLength(1);
    await expect(db.query('SELECT id FROM auth.users')).rejects.toThrow('permission denied');
    expect((await db.query('SELECT id FROM public.d1_migration_auth_ids_20261022')).rows).toHaveLength(1);
    await expect(db.query('SELECT encrypted_password FROM auth.users')).rejects.toThrow('permission denied');
    await expect(db.query("INSERT INTO users_profile VALUES('forbidden')")).rejects.toThrow('permission denied');
    await expect(db.query("SELECT marketplace_increment_views('test')")).rejects.toThrow('permission denied');
    await db.exec('CREATE TEMP TABLE reader_probe(id text)');
    await expect(db.exec('CREATE TRIGGER cannot_attach BEFORE INSERT ON reader_probe FOR EACH ROW EXECUTE FUNCTION public.capture_trigger()')).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE');
    // Existing triggers still fire for an ordinary invoker without EXECUTE on the trigger function.
    await db.exec("CREATE ROLE trigger_caller; GRANT INSERT ON rfp_posts TO trigger_caller; SET ROLE trigger_caller; INSERT INTO rfp_posts VALUES('ordinary-insert'); RESET ROLE;");
    expect((await db.query("SELECT id FROM users_profile")).rows).toEqual([{id:'trigger-ran'}]);
    for(const role of ['anon','authenticated','service_role']){
      await db.exec(`SET ROLE ${role}`);await db.query("SELECT marketplace_increment_views('no-such-listing')");await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});
