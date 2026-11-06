"""Generate a review-only duration renewal. No connection or Source data writes."""
import json,re
from pathlib import Path
import change_capture as c
import migrate as m

OLD='2026-11-05 10:00:00+00'
NEW='2026-11-12 10:00:00+00'
APPROVAL='__APPROVE_CAPTURE_RENEWAL_20261105__'

def generate(catalog):
    guard=c.function_guard(catalog,expires=OLD)
    original=(m.ROOT/'d1/auth-reader-proposal-2026-11-03.sql').read_text()
    view_query=re.search(r'CREATE VIEW d1_migration.auth_export_v1 WITH \(security_barrier=true\) AS\n(.*?);',original,re.S).group(1)
    return f"""-- REVIEW ONLY: explicit approval required to renew sensitive private-data access.
-- Same reader/credentials/grants; renew role, bounded ACK and Auth view until Nov 12.
-- No application rows, Auth credentials, policies or capture triggers are changed.
BEGIN;
SET LOCAL timezone='UTC';
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $renew$
DECLARE definition text; body text; before_acl aclitem[]; view_acl aclitem[];
BEGIN
 IF '{APPROVAL}' <> 'approved-capture-renewal-v1' THEN RAISE EXCEPTION 'Review-only renewal requires approval'; END IF;
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed owner required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{c.READER}' AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolbypassrls AND rolconnlimit=3 AND rolvaliduntil='{OLD}'::timestamptz) THEN RAISE EXCEPTION 'Reader boundary changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='{c.READER}')) THEN RAISE EXCEPTION 'Reader memberships changed'; END IF;
 IF (SELECT obj_description(oid,'pg_namespace') FROM pg_namespace WHERE nspname='d1_migration') IS DISTINCT FROM 'pmrfp-d1-change-capture-v1; reviewed 2026-10-31' THEN RAISE EXCEPTION 'Private schema changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='d1_migration' AND p.proname IN ('capture_row','capture_truncate','acknowledge') AND p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')) THEN RAISE EXCEPTION 'Queue owner changed'; END IF;
 IF ({guard}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Reviewed queue functions changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege('{c.READER}',format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) OR has_column_privilege('{c.READER}','auth.users','encrypted_password','SELECT') THEN RAISE EXCEPTION 'Reader permissions changed'; END IF;
 IF NOT has_function_privilege('{c.READER}','d1_migration.acknowledge(bigint[],text)','EXECUTE') OR NOT has_table_privilege('{c.READER}','d1_migration.auth_export_v1','SELECT') THEN RAISE EXCEPTION 'Existing scoped access missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='d1_migration' AND (has_schema_privilege('anon',n.oid,'USAGE') OR has_schema_privilege('authenticated',n.oid,'USAGE') OR has_schema_privilege('service_role',n.oid,'USAGE') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee=0))) THEN RAISE EXCEPTION 'Private schema exposed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='d1_migration.auth_export_v1'::regclass AND relkind='v' AND relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND 'security_barrier=true'=ANY(reloptions)) OR obj_description('d1_migration.auth_export_v1'::regclass,'pg_class') IS DISTINCT FROM 'pmrfp-sensitive-auth-export-v1; approved complete Supabase exit; expires 2026-11-05T10:00:00Z' THEN RAISE EXCEPTION 'Auth view boundary changed'; END IF;
 CREATE TEMP VIEW _d1_reviewed_auth_export_v1 WITH (security_barrier=true) AS {view_query};
 IF pg_get_viewdef('d1_migration.auth_export_v1'::regclass,true) IS DISTINCT FROM pg_get_viewdef('_d1_reviewed_auth_export_v1'::regclass,true) THEN RAISE EXCEPTION 'Auth view definition changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='d1_migration.auth_export_v1'::regclass AND (a.grantee NOT IN ((SELECT oid FROM pg_roles WHERE rolname='postgres'),(SELECT oid FROM pg_roles WHERE rolname='{c.READER}')) OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{c.READER}') AND a.privilege_type<>'SELECT'))) THEN RAISE EXCEPTION 'Auth view ACL changed'; END IF;
 SELECT proacl,pg_get_functiondef(oid),prosrc INTO before_acl,definition,body FROM pg_proc WHERE oid='d1_migration.acknowledge(bigint[],text)'::regprocedure;
 IF (length(body)-length(replace(body,'{OLD}','')))/length('{OLD}')<>1 THEN RAISE EXCEPTION 'ACK expiry not uniquely identified'; END IF;
 EXECUTE replace(definition,'{OLD}','{NEW}');
 IF (SELECT proacl FROM pg_proc WHERE oid='d1_migration.acknowledge(bigint[],text)'::regprocedure) IS DISTINCT FROM before_acl THEN RAISE EXCEPTION 'ACK grants changed'; END IF;
 SELECT relacl INTO view_acl FROM pg_class WHERE oid='d1_migration.auth_export_v1'::regclass;
 definition:=pg_get_viewdef('d1_migration.auth_export_v1'::regclass,true);
 IF (length(definition)-length(replace(definition,'{OLD}','')))/length('{OLD}')<>1 OR position('clock_timestamp()' IN definition)=0 THEN RAISE EXCEPTION 'Auth expiry not uniquely identified'; END IF;
 EXECUTE 'CREATE OR REPLACE VIEW d1_migration.auth_export_v1 WITH (security_barrier=true) AS '||replace(definition,'{OLD}','{NEW}');
 IF (SELECT relacl FROM pg_class WHERE oid='d1_migration.auth_export_v1'::regclass) IS DISTINCT FROM view_acl THEN RAISE EXCEPTION 'Auth view grants changed'; END IF;
 EXECUTE 'ALTER ROLE {c.READER} VALID UNTIL ''{NEW}''';
END $renew$;
DROP VIEW _d1_reviewed_auth_export_v1;
COMMENT ON VIEW d1_migration.auth_export_v1 IS 'pmrfp-sensitive-auth-export-v1; approved complete Supabase exit; expires 2026-11-12T10:00:00Z';
COMMIT;
"""

if __name__=='__main__':
    path=m.ROOT/'d1/capture-access-renewal-proposal-2026-11-05.sql'
    with path.open('x') as out:out.write(generate(m.load_catalog()))
    print('Review-only duration renewal saved; no database contacted.')
