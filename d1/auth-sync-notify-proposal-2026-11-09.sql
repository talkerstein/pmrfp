-- Review only. Wake a private sync consumer after an Auth transaction commits.
-- The notification carries no account data. Consumers must reconcile on startup,
-- reconnect and periodically, because PostgreSQL notifications are not durable.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

DO $guard$
BEGIN
  IF '__APPROVE_AUTH_SYNC_NOTIFY__' = '__APPROVE_' || 'AUTH_SYNC_NOTIFY__' THEN
    RAISE EXCEPTION 'Review-only Auth sync trigger requires approval';
  END IF;
  IF current_user <> 'postgres'
    OR to_regclass('auth.users') IS NULL
    OR obj_description('d1_migration.auth_export_v1'::regclass, 'pg_class')
      IS DISTINCT FROM 'pmrfp-sensitive-auth-export-v1; approved complete Supabase exit; expires 2026-11-12T10:00:00Z'
  THEN
    RAISE EXCEPTION 'Reviewed Auth source required';
  END IF;
END
$guard$;

LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;

CREATE FUNCTION d1_migration.signal_auth_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $signal$
BEGIN
  PERFORM pg_notify('pmrfp_auth_sync_v1', '');
  RETURN NULL;
END
$signal$;

REVOKE ALL ON FUNCTION d1_migration.signal_auth_sync()
  FROM PUBLIC, anon, authenticated, service_role, d1_migration_reader_20261022;

CREATE TRIGGER d1_migration_auth_sync_membership
AFTER INSERT OR DELETE OR TRUNCATE ON auth.users
FOR EACH STATEMENT EXECUTE FUNCTION d1_migration.signal_auth_sync();

CREATE TRIGGER d1_migration_auth_sync_update
AFTER UPDATE ON auth.users FOR EACH ROW
WHEN (
  ROW(OLD.id, OLD.email, OLD.encrypted_password, OLD.email_confirmed_at,
    OLD.phone, OLD.phone_confirmed_at, OLD.created_at, OLD.updated_at, OLD.banned_until,
    OLD.deleted_at, OLD.is_anonymous, OLD.is_sso_user, OLD.raw_user_meta_data, OLD.raw_app_meta_data)
  IS DISTINCT FROM
  ROW(NEW.id, NEW.email, NEW.encrypted_password, NEW.email_confirmed_at,
    NEW.phone, NEW.phone_confirmed_at, NEW.created_at, NEW.updated_at, NEW.banned_until,
    NEW.deleted_at, NEW.is_anonymous, NEW.is_sso_user, NEW.raw_user_meta_data, NEW.raw_app_meta_data)
)
EXECUTE FUNCTION d1_migration.signal_auth_sync();

COMMIT;
