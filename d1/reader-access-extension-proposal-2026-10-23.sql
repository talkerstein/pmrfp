-- REVIEW ONLY: extend the existing expiring reader to three newly added tables.
-- No credentials, writes, default grants or expiry changes.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF '__APPROVE_THREE_TABLE_READS__' = '__APPROVE_' || 'THREE_TABLE_READS__' THEN RAISE EXCEPTION 'Review-only proposal requires approval'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='d1_migration_reader_20261022' AND rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit AND rolvaliduntil='2026-10-29 10:00:00+00'::timestamptz) THEN RAISE EXCEPTION 'Reader configuration changed'; END IF;
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='public') <> 101 THEN RAISE EXCEPTION 'Table inventory changed'; END IF;
 IF md5(pg_get_functiondef('public.has_active_trade_access(uuid)'::regprocedure)) <> '493b2cd89346e24c089838165eaef7d0' OR md5(pg_get_functiondef('public.has_intel_access(uuid)'::regprocedure)) <> '9ff939f9100552ac1261d49e2c2b7ac5' OR md5(pg_get_functiondef('public.is_admin(uuid)'::regprocedure)) <> '41bc6018cf2cb834cf0502373e3a9240' OR md5(pg_get_functiondef('public.is_org_member(uuid, uuid)'::regprocedure)) <> 'ca8cec8b9e56926ca7bd47c82afca213' THEN RAISE EXCEPTION 'Read helper definitions changed'; END IF;
END $guard$;
GRANT SELECT ON public.badge_rewards, public.email_consents, public.rfp_changes TO d1_migration_reader_20261022;
DO $verify$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename IN ('badge_rewards','email_consents','rfp_changes') AND (NOT has_table_privilege('d1_migration_reader_20261022',format('%I.%I',schemaname,tablename),'SELECT') OR has_table_privilege('d1_migration_reader_20261022',format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN RAISE EXCEPTION 'Reader grant validation failed'; END IF;
END $verify$;
COMMIT;
