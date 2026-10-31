"""Review-only renewal for the existing reader; never contacts a database."""
import hashlib,json
from reader_access import ROLE,literal,ident
NEW_TABLES={'blocked_domains','contractor_activity','open_data_runs','org_link_clicks','organization_risk','permit_leads','planned_procurements'}
HELPERS={'has_active_trade_access':'uuid','has_intel_access':'uuid','is_admin':'uuid','is_org_member':'uuid, uuid','guard_organization_link_fields':''}
OLD_EXPIRY='2026-10-29 10:00:00+00'
NEW_EXPIRY='2026-11-05 10:00:00+00'
APPROVAL='__APPROVE_READER_RENEWAL_20261029__'

def generate(catalog):
    tables=sorted({c['table_name'] for c in catalog['columns']})
    if len(tables)!=108 or not NEW_TABLES.issubset(tables):raise ValueError('Unexpected renewal inventory')
    definitions={f['name']:f['definition'] for f in catalog['functions'] if f['name'] in HELPERS}
    if set(definitions)!=set(HELPERS):raise ValueError('Missing audited helper definition')
    inventory='ARRAY['+','.join(literal(t) for t in tables)+']::text[]'
    signatures=sorted('public.'+n+'('+a+')' for n,a in HELPERS.items())
    expected='ARRAY['+','.join(literal(s) for s in signatures)+']::text[]'
    hashes=' OR '.join('md5(pg_get_functiondef('+literal('public.'+n+'('+HELPERS[n]+')')+'::regprocedure)) <> '+literal(hashlib.md5(definitions[n].encode()).hexdigest()) for n in sorted(HELPERS))
    return f'''-- REVIEW ONLY: requires explicit approval for renewed private-data access.
-- Same reader and credential; expiry extended to November 5, 2026, 15:30 India.
-- Seven SELECT-only grants; no default grants, table writes or Auth secrets.
-- One new PUBLIC definer EXECUTE path narrowed while app callers/triggers remain.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF '{APPROVAL}' = '__APPROVE_' || 'READER_RENEWAL_20261029__' THEN RAISE EXCEPTION 'Review-only renewal requires approval'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{ROLE}' AND rolcanlogin AND rolbypassrls AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit AND rolconnlimit=3 AND rolvaliduntil='{OLD_EXPIRY}'::timestamptz) THEN RAISE EXCEPTION 'Existing reader configuration changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='{ROLE}')) THEN RAISE EXCEPTION 'Unexpected reader memberships'; END IF;
 IF (SELECT array_agg(tablename::text ORDER BY tablename) FROM pg_tables WHERE schemaname='public') IS DISTINCT FROM {inventory} THEN RAISE EXCEPTION 'Live table inventory changed'; END IF;
 IF {hashes} THEN RAISE EXCEPTION 'Audited helper definitions changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege('{ROLE}',format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN RAISE EXCEPTION 'Reader has table write privileges'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND has_schema_privilege('{ROLE}',n.oid,'CREATE')) THEN RAISE EXCEPTION 'Reader can create persistent schema objects'; END IF;
 IF (SELECT array_agg(format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) ORDER BY format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname IN ('public','auth') OR has_schema_privilege('{ROLE}',n.oid,'USAGE')) AND p.prosecdef AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) IS DISTINCT FROM {expected} THEN RAISE EXCEPTION 'Inherited definer inventory changed'; END IF;
 IF has_column_privilege('{ROLE}','auth.users'::regclass,'encrypted_password','SELECT') THEN RAISE EXCEPTION 'Reader can read Auth secrets'; END IF;
END $guard$;
REVOKE EXECUTE ON FUNCTION public.guard_organization_link_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_organization_link_fields() TO anon,authenticated,service_role;
GRANT SELECT ON {','.join('public.'+ident(t) for t in sorted(NEW_TABLES))} TO {ident(ROLE)};
ALTER ROLE {ident(ROLE)} VALID UNTIL '{NEW_EXPIRY}';
DO $verify$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND (NOT has_table_privilege('{ROLE}',format('%I.%I',schemaname,tablename),'SELECT') OR has_table_privilege('{ROLE}',format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN RAISE EXCEPTION 'Read-only renewal validation failed'; END IF;
 IF NOT has_table_privilege('{ROLE}','public.d1_migration_auth_ids_20261022','SELECT') OR has_column_privilege('{ROLE}','auth.users'::regclass,'encrypted_password','SELECT') OR has_function_privilege('{ROLE}','public.guard_organization_link_fields()','EXECUTE') THEN RAISE EXCEPTION 'Reader boundary validation failed'; END IF;
END $verify$;
COMMIT;
'''

if __name__=='__main__':
    import argparse
    from pathlib import Path
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--catalog',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    sql=generate(json.loads(Path(a.catalog).read_text()))
    with Path(a.output).open('x') as f:f.write(sql)
    print('Guarded renewal proposal saved; no database changes made.')
