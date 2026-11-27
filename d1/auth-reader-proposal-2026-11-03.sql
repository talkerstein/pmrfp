-- REVIEW ONLY. Adds sensitive credential-hash access for the approved full exit.
-- Existing reader/credential/November 5 expiry remain unchanged. No table writes,
-- refresh tokens, active sessions, MFA secrets, or plaintext passwords are exposed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $guard$ BEGIN
 IF '__APPROVE_AUTH_EXPORT_20261103__' = '__APPROVE_' || 'AUTH_EXPORT_20261103__' THEN
  RAISE EXCEPTION 'Review-only Auth export requires approval';
 END IF;
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed database owner required'; END IF;
 IF (SELECT obj_description(oid,'pg_namespace') FROM pg_namespace WHERE nspname='d1_migration') IS DISTINCT FROM 'pmrfp-d1-change-capture-v1; reviewed 2026-10-31' THEN RAISE EXCEPTION 'Reviewed private schema missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='d1_migration_reader_20261022' AND rolcanlogin AND rolbypassrls AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit AND rolconnlimit=3 AND rolvaliduntil='2026-11-05 10:00:00+00'::timestamptz) THEN RAISE EXCEPTION 'Reader boundary changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='d1_migration_reader_20261022')) THEN RAISE EXCEPTION 'Unexpected reader memberships'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='d1_migration' AND (has_schema_privilege('anon',n.oid,'USAGE') OR has_schema_privilege('authenticated',n.oid,'USAGE') OR has_schema_privilege('service_role',n.oid,'USAGE') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee=0))) THEN RAISE EXCEPTION 'Private schema has application access'; END IF;
 IF to_regclass('d1_migration.auth_export_v1') IS NOT NULL THEN RAISE EXCEPTION 'Auth export already exists'; END IF;
 IF has_column_privilege('d1_migration_reader_20261022','auth.users','encrypted_password','SELECT') THEN RAISE EXCEPTION 'Unexpected direct Auth secret access'; END IF;
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege('d1_migration_reader_20261022',format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN RAISE EXCEPTION 'Unexpected reader application writes'; END IF;
END $guard$;
CREATE VIEW d1_migration.auth_export_v1 WITH (security_barrier=true) AS
 SELECT u.id,u.email,u.encrypted_password,u.email_confirmed_at,u.phone,
        u.phone_confirmed_at,u.created_at,u.updated_at,u.banned_until,u.deleted_at,
        u.is_anonymous,u.is_sso_user,u.raw_user_meta_data,u.raw_app_meta_data
 FROM auth.users u
 WHERE clock_timestamp() < '2026-11-05 10:00:00+00'::timestamptz;
COMMENT ON VIEW d1_migration.auth_export_v1 IS 'pmrfp-sensitive-auth-export-v1; approved complete Supabase exit; expires 2026-11-05T10:00:00Z';
REVOKE ALL ON d1_migration.auth_export_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON d1_migration.auth_export_v1 TO d1_migration_reader_20261022;
DO $verify$ BEGIN
 IF NOT has_table_privilege('d1_migration_reader_20261022','d1_migration.auth_export_v1','SELECT') OR has_table_privilege('d1_migration_reader_20261022','d1_migration.auth_export_v1','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_column_privilege('d1_migration_reader_20261022','auth.users','encrypted_password','SELECT') THEN RAISE EXCEPTION 'Auth export boundary verification failed'; END IF;
END $verify$;
COMMIT;
