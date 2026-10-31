"""Render a review-only, expiring migration-reader provisioning proposal.

Never executes SQL or creates credentials. Apply only after explicit approval.
No table writes, role memberships, replication, schema creation or auth secrets.
"""
import argparse,hashlib,json,re
from pathlib import Path
from schema import ROOT,ident

ROLE='d1_migration_reader_20261022'
READ_HELPERS={'has_active_trade_access','has_intel_access','is_admin','is_org_member'}

def literal(s):return "'"+s.replace("'","''")+"'"

def generate(catalog,expires='2026-10-29 10:00:00+00',preflight=None):
    preflight=preflight or json.loads((ROOT/'d1/reader-access-preflight-2026-10-22.json').read_text())
    functions=preflight['public_definer_execute']
    signatures_by_name={}
    for f in functions:
        if f['schema']!='public' or not re.fullmatch(r'public\.[a-z_][a-z0-9_]*\([a-z0-9_, \[\]]*\)',f['signature']) or f['name'] in signatures_by_name:raise ValueError('Unaudited schema, signature or overload')
        signatures_by_name[f['name']]=f['signature']
    if not READ_HELPERS.issubset(signatures_by_name):raise ValueError('Audited read helpers missing')
    tables=sorted({c['table_name'] for c in catalog['columns']})
    definitions={f['name']:f['definition'] for f in catalog['functions'] if f['name'] in signatures_by_name}
    if set(definitions)!=set(signatures_by_name):raise ValueError('Expected audited function definitions')
    expected='ARRAY['+','.join(literal(t) for t in tables)+']::text[]'
    hashes=' OR '.join('md5(pg_get_functiondef('+literal(signatures_by_name[n])+"::regprocedure)) <> "+literal(hashlib.md5(definitions[n].encode()).hexdigest()) for n in sorted(signatures_by_name))
    signatures='ARRAY['+','.join(literal(signatures_by_name[n]) for n in sorted(signatures_by_name))+']::text[]'
    sql=f'''-- REVIEW ONLY. Approval guard prevents applying this proposal as-is.
-- The database generates the password; it is never embedded in this SQL.
-- New access requires explicit approval. Expires {expires}.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF '__GENERATE_PRIVATE_PASSWORD_AFTER_APPROVAL__' = '__GENERATE_' || 'PRIVATE_PASSWORD_AFTER_APPROVAL__' THEN RAISE EXCEPTION 'Review-only proposal: inject a private credential after approval'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname={literal(ROLE)}) THEN RAISE EXCEPTION 'Reader role already exists; refusing to alter credentials'; END IF;
 IF (SELECT array_agg(tablename::text ORDER BY tablename) FROM pg_tables WHERE schemaname='public') IS DISTINCT FROM {expected} THEN RAISE EXCEPTION 'Table inventory changed'; END IF;
 IF {hashes} THEN RAISE EXCEPTION 'Audited helper definition changed'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.table_privileges WHERE grantee='PUBLIC' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES') AND table_schema NOT IN ('pg_catalog','information_schema')) THEN RAISE EXCEPTION 'Inherited PUBLIC table writes require review'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a WHERE a.grantee=0 AND a.privilege_type='CREATE')) THEN RAISE EXCEPTION 'Inherited schema creation requires review'; END IF;
 IF (SELECT array_agg(format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) ORDER BY format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) COLLATE \"C\") FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname IN ('public','auth') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))s WHERE s.grantee=0 AND s.privilege_type='USAGE')) AND p.prosecdef AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) IS DISTINCT FROM {signatures} THEN RAISE EXCEPTION 'Inherited definer functions changed'; END IF;
END $guard$;
DO $create_reader$
BEGIN
 PERFORM set_config('d1_migration.reader_password',replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),true);
 EXECUTE format('CREATE ROLE {ident(ROLE)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS CONNECTION LIMIT 3 PASSWORD %L VALID UNTIL %L',current_setting('d1_migration.reader_password'),{literal(expires)});
EXCEPTION WHEN OTHERS THEN
 RAISE EXCEPTION 'Reader role creation failed; transaction must roll back (credential details suppressed)';
END $create_reader$;
ALTER ROLE {ident(ROLE)} SET default_transaction_read_only=on;
ALTER ROLE {ident(ROLE)} SET statement_timeout='5min';
ALTER ROLE {ident(ROLE)} SET lock_timeout='5s';
ALTER ROLE {ident(ROLE)} SET idle_in_transaction_session_timeout='60s';
GRANT USAGE ON SCHEMA public,auth TO {ident(ROLE)};
GRANT SELECT(id) ON auth.users TO {ident(ROLE)};
'''
    sql+='\n'.join('GRANT SELECT ON TABLE public.'+ident(t)+' TO '+ident(ROLE)+';' for t in tables)+'\n'
    unsafe=[signatures_by_name[n] for n in sorted(signatures_by_name) if n not in READ_HELPERS]
    sql+='-- Preserve app callers and existing triggers while denying inherited definer paths.\n'
    for signature in unsafe:
        sql+='REVOKE EXECUTE ON FUNCTION '+signature+' FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION '+signature+' TO anon,authenticated,service_role;\n'
    sql+=f'''DO $verify$
BEGIN
 IF {' OR '.join('has_function_privilege('+literal(ROLE)+','+literal(signature)+",'EXECUTE')" for signature in unsafe)} THEN RAISE EXCEPTION 'Reader can execute a restricted definer function'; END IF;
 IF has_column_privilege({literal(ROLE)},'auth.users','encrypted_password','SELECT') THEN RAISE EXCEPTION 'Reader can read auth secrets'; END IF;
 IF NOT has_schema_privilege({literal(ROLE)},'auth','USAGE') OR NOT has_column_privilege({literal(ROLE)},'auth.users','id','SELECT') THEN RAISE EXCEPTION 'Reader lacks auth ID references'; END IF;
 IF EXISTS(SELECT 1 FROM pg_tables t WHERE t.schemaname='public' AND (NOT has_table_privilege({literal(ROLE)},format('%I.%I',t.schemaname,t.tablename),'SELECT') OR has_table_privilege({literal(ROLE)},format('%I.%I',t.schemaname,t.tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN RAISE EXCEPTION 'Reader grants failed'; END IF;
END $verify$;
SELECT current_setting('d1_migration.reader_password') AS reader_password;
COMMIT;
'''
    return sql

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--catalog',default=str(ROOT/'d1/production-catalog-2026-10-22.json'));p.add_argument('--output',required=True);a=p.parse_args()
    out=Path(a.output)
    if out.exists():raise FileExistsError('Refusing to overwrite a reviewed proposal')
    out.write_text(generate(json.loads(Path(a.catalog).read_text())))
    print('Review-only SQL proposal generated; no database contacted.')
