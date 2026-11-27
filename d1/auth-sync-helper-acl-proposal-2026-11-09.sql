-- REVIEW ONLY. Run inside the approved reader transaction after CREATE ROLE,
-- before its final permission verification. Keep all current role access.
DO $acl$
DECLARE
  helper regprocedure;
  existing_role record;
  sync_role constant text := 'd1_customer_auth_sync_20261109';
BEGIN
  IF '__APPROVE_AUTH_SYNC_HELPER_ACL__' = '__APPROVE_' || 'AUTH_SYNC_HELPER_ACL__'
    OR current_user <> 'postgres'
  THEN
    RAISE EXCEPTION 'Review-only helper grants require separate approval';
  END IF;

  FOREACH helper IN ARRAY ARRAY[
    'public.has_active_trade_access(uuid)'::regprocedure,
    'public.has_intel_access(uuid)'::regprocedure,
    'public.is_admin(uuid)'::regprocedure,
    'public.is_org_member(uuid,uuid)'::regprocedure
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=helper AND p.prosecdef AND p.provolatile='s'
        AND a.grantee=0 AND a.privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'Reviewed helper grant changed: %', helper;
    END IF;

    -- PUBLIC cannot exclude a single role. Replace its EXECUTE grant with
    -- explicit grants for existing roles that would otherwise lose access.
    FOR existing_role IN SELECT rolname FROM pg_roles WHERE rolname <> sync_role
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', helper, existing_role.rolname);
    END LOOP;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', helper);
    IF has_function_privilege(sync_role,helper,'EXECUTE') THEN
      RAISE EXCEPTION 'Sync role still inherits helper execution: %', helper;
    END IF;
  END LOOP;
END
$acl$;
