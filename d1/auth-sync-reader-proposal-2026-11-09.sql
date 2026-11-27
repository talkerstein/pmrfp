-- REVIEW ONLY. Isolate the staging sync pool from the existing migration reader.
-- The password marker must be replaced locally with an independent generated secret.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL password_encryption = 'scram-sha-256';

DO $guard$
BEGIN
  IF '__APPROVE_AUTH_SYNC_READER__' = '__APPROVE_' || 'AUTH_SYNC_READER__' THEN
    RAISE EXCEPTION 'Review-only staging Auth reader requires approval';
  END IF;
  IF current_user <> 'postgres'
    OR obj_description('d1_migration.auth_export_v1'::regclass, 'pg_class')
      IS DISTINCT FROM 'pmrfp-sensitive-auth-export-v1; approved complete Supabase exit; expires 2026-11-12T10:00:00Z'
    OR to_regclass('public.d1_migration_auth_ids_20261022') IS NULL
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='d1_customer_auth_sync_20261109')
  THEN
    RAISE EXCEPTION 'Reviewed source views or role boundary changed';
  END IF;
END
$guard$;

CREATE ROLE d1_customer_auth_sync_20261109 LOGIN NOINHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8 PASSWORD '__SYNC_PASSWORD__'
  VALID UNTIL '2026-11-12 10:00:00+00';
ALTER ROLE d1_customer_auth_sync_20261109 SET default_transaction_read_only = on;
GRANT USAGE ON SCHEMA d1_migration TO d1_customer_auth_sync_20261109;
GRANT SELECT ON d1_migration.auth_export_v1, public.d1_migration_auth_ids_20261022
  TO d1_customer_auth_sync_20261109;

DO $verify$
BEGIN
  IF has_column_privilege('d1_customer_auth_sync_20261109','auth.users','encrypted_password','SELECT')
    OR has_table_privilege('d1_customer_auth_sync_20261109','auth.sessions','SELECT')
    OR EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','auth','d1_migration') AND c.relkind IN ('r','p','v','m')
        AND (has_table_privilege('d1_customer_auth_sync_20261109',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR (c.oid NOT IN ('d1_migration.auth_export_v1'::regclass, 'public.d1_migration_auth_ids_20261022'::regclass)
            AND has_any_column_privilege('d1_customer_auth_sync_20261109',c.oid,'SELECT')))
    )
    OR EXISTS (
      SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
      WHERE n.nspname IN ('public','auth','d1_migration') AND f.prosecdef
        AND has_schema_privilege('d1_customer_auth_sync_20261109',n.oid,'USAGE')
        AND has_function_privilege('d1_customer_auth_sync_20261109',f.oid,'EXECUTE')
    )
  THEN
    RAISE EXCEPTION 'Unexpected Auth sync reader privilege';
  END IF;
END
$verify$;

COMMIT;
