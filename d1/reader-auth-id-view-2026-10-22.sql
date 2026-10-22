-- Supplement to the authorized reader setup: ID-only view for managed Auth schema.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE VIEW public.d1_migration_auth_ids_20261022 WITH (security_barrier=true) AS SELECT id FROM auth.users;
REVOKE ALL ON public.d1_migration_auth_ids_20261022 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.d1_migration_auth_ids_20261022 TO d1_migration_reader_20261022;
DO $$ BEGIN
 IF NOT has_table_privilege('d1_migration_reader_20261022','public.d1_migration_auth_ids_20261022','SELECT') THEN RAISE EXCEPTION 'Reader view grant missing'; END IF;
 IF has_table_privilege('anon','public.d1_migration_auth_ids_20261022','SELECT') OR has_table_privilege('authenticated','public.d1_migration_auth_ids_20261022','SELECT') THEN RAISE EXCEPTION 'Unexpected app access'; END IF;
END $$;
COMMIT;
