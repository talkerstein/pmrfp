"""Generate review-only source outbox setup. Never connects to or modifies a database."""
import argparse,json
from pathlib import Path
import migrate as m

READER='d1_migration_reader_20261022'
def literal(value):return "'"+value.replace("'","''")+"'"
def generate(catalog):
    specs={name:spec for name,spec in m.table_specs(catalog).items() if name!='_auth_users'}
    registry=[{'table':name,'pk':spec['pk']} for name,spec in sorted(specs.items())]
    expected=m.canonical(registry)
    sql=f'''-- REVIEW ONLY: installing this adds source-side change metadata writes and a narrow ACK permission.
-- Existing application rows, Auth credentials, grants, policies and functions are not rewritten.
-- At-least-once queue: poll ALL unacknowledged events; never advance an ID watermark.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $timeout$ BEGIN
 IF current_setting('transaction_timeout',true) IS NOT NULL THEN PERFORM set_config('transaction_timeout','30s',true); END IF;
END $timeout$;
DO $preflight$
DECLARE actual jsonb;
BEGIN
 IF '__APPROVE_D1_CHANGE_CAPTURE_20261031__' <> 'approved-d1-change-capture-v1' THEN
  RAISE EXCEPTION 'Review-only change capture: explicit approval required';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='d1_migration') THEN
  RAISE EXCEPTION 'Existing migration schema requires separate review';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{READER}' AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolbypassrls AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<='2026-11-05 10:00:00+00'::timestamptz) THEN
  RAISE EXCEPTION 'Reader boundary or expiry changed';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='{READER}')) OR
 EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND (NOT has_table_privilege('{READER}',format('%I.%I',schemaname,tablename),'SELECT') OR has_table_privilege('{READER}',format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN
  RAISE EXCEPTION 'Reader application permissions changed';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('{READER}',p.oid,'EXECUTE') AND p.proname NOT IN ('has_active_trade_access','has_intel_access','is_admin','is_org_member')) THEN
  RAISE EXCEPTION 'Unexpected inherited definer execution';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('table',tablename,'pk',keys) ORDER BY tablename) INTO actual FROM (
  SELECT t.tablename,(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.conrelid=format('%I.%I',t.schemaname,t.tablename)::regclass AND c.contype='p') AS keys
  FROM pg_tables t WHERE t.schemaname='public'
 ) audited;
 IF actual IS DISTINCT FROM {literal(expected)}::jsonb THEN RAISE EXCEPTION 'Source table/primary-key inventory changed'; END IF;
END $preflight$;
LOCK TABLE {','.join('public.'+m.ident(t) for t in sorted(specs))} IN SHARE ROW EXCLUSIVE MODE NOWAIT;
CREATE SCHEMA d1_migration;
COMMENT ON SCHEMA d1_migration IS 'pmrfp-d1-change-capture-v1; reviewed 2026-10-31';
REVOKE ALL ON SCHEMA d1_migration FROM PUBLIC;
CREATE TABLE d1_migration.registered_tables(table_name text PRIMARY KEY,pk_columns text[] NOT NULL);
CREATE TABLE d1_migration.outbox(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 table_name text NOT NULL REFERENCES d1_migration.registered_tables(table_name),
 operation text NOT NULL CHECK(operation IN ('upsert','delete','truncate')),
 key jsonb NOT NULL CHECK(jsonb_typeof(key)='object'),
 source_txid bigint NOT NULL DEFAULT txid_current(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 acknowledged_at timestamptz,
 destination_sha256 text CHECK(destination_sha256 ~ '^[a-f0-9]{{64}}$'),
 CHECK((acknowledged_at IS NULL)=(destination_sha256 IS NULL)),
 CHECK((operation='truncate' AND key='{{}}'::jsonb) OR (operation<>'truncate' AND key<>'{{}}'::jsonb))
);
CREATE INDEX outbox_pending_idx ON d1_migration.outbox(id) WHERE acknowledged_at IS NULL;
CREATE INDEX outbox_pending_table_idx ON d1_migration.outbox(table_name,id) WHERE acknowledged_at IS NULL;
ALTER TABLE d1_migration.registered_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE d1_migration.outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA d1_migration FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA d1_migration FROM PUBLIC;
GRANT USAGE ON SCHEMA d1_migration TO {READER};
GRANT SELECT ON d1_migration.registered_tables,d1_migration.outbox TO {READER};
'''
    for row in registry:
        sql+='INSERT INTO d1_migration.registered_tables VALUES('+literal(row['table'])+',ARRAY['+','.join(map(literal,row['pk']))+']);\n'
    sql+='''CREATE FUNCTION d1_migration.capture_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $capture$
DECLARE keys text[]; old_key jsonb; new_key jsonb;
BEGIN
 IF pg_trigger_depth()=0 OR TG_TABLE_SCHEMA<>'public' THEN RAISE EXCEPTION 'Trigger invocation required'; END IF;
 SELECT pk_columns INTO keys FROM d1_migration.registered_tables WHERE table_name=TG_TABLE_NAME;
 IF keys IS NULL THEN RAISE EXCEPTION 'Unregistered source table'; END IF;
 IF TG_OP='UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
 IF TG_OP IN ('UPDATE','DELETE') THEN
  SELECT jsonb_object_agg(k,to_jsonb(OLD)->k) INTO old_key FROM unnest(keys) k;
 END IF;
 IF TG_OP IN ('UPDATE','INSERT') THEN
  SELECT jsonb_object_agg(k,to_jsonb(NEW)->k) INTO new_key FROM unnest(keys) k;
 END IF;
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND old_key IS DISTINCT FROM new_key) THEN
  INSERT INTO d1_migration.outbox(table_name,operation,key) VALUES(TG_TABLE_NAME,'delete',old_key);
 END IF;
 IF TG_OP<>'DELETE' THEN
  INSERT INTO d1_migration.outbox(table_name,operation,key) VALUES(TG_TABLE_NAME,'upsert',new_key);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $capture$;
CREATE FUNCTION d1_migration.capture_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $capture$
BEGIN
 IF pg_trigger_depth()=0 OR TG_TABLE_SCHEMA<>'public' OR TG_OP<>'TRUNCATE' THEN RAISE EXCEPTION 'Truncate trigger invocation required'; END IF;
 INSERT INTO d1_migration.outbox(table_name,operation,key) VALUES(TG_TABLE_NAME,'truncate','{}'::jsonb);
 RETURN NULL;
END $capture$;
CREATE FUNCTION d1_migration.acknowledge(p_ids bigint[],p_destination_sha256 text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $ack$
DECLARE affected integer;
BEGIN
 IF clock_timestamp()>='2026-11-05 10:00:00+00'::timestamptz THEN RAISE EXCEPTION 'Change acknowledgement window expired'; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)<1 OR cardinality(p_ids)>500 OR p_destination_sha256 IS NULL OR p_destination_sha256 !~ '^[a-f0-9]{64}$' OR
 EXISTS(SELECT 1 FROM unnest(p_ids) i WHERE i IS NULL OR i<1) OR
 (SELECT count(DISTINCT i) FROM unnest(p_ids) i)<>cardinality(p_ids) THEN RAISE EXCEPTION 'Invalid bounded acknowledgement'; END IF;
 IF (SELECT count(*) FROM d1_migration.outbox WHERE id=ANY(p_ids))<>cardinality(p_ids) THEN RAISE EXCEPTION 'Unknown acknowledgement IDs'; END IF;
 UPDATE d1_migration.outbox SET acknowledged_at=clock_timestamp(),destination_sha256=p_destination_sha256 WHERE id=ANY(p_ids) AND acknowledged_at IS NULL;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END $ack$;
REVOKE ALL ON FUNCTION d1_migration.capture_row(),d1_migration.capture_truncate(),d1_migration.acknowledge(bigint[],text) FROM PUBLIC;
'''
    sql+=f'GRANT EXECUTE ON FUNCTION d1_migration.acknowledge(bigint[],text) TO {READER};\n'
    sql+="DO $install$ DECLARE t text; BEGIN\n FOREACH t IN ARRAY ARRAY["+','.join(map(literal,sorted(specs)))+"] LOOP\n"
    sql+="  EXECUTE format('CREATE TRIGGER d1_migration_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION d1_migration.capture_row()',t);\n"
    sql+="  EXECUTE format('CREATE TRIGGER d1_migration_truncate AFTER TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION d1_migration.capture_truncate()',t);\n END LOOP;\nEND $install$;\n"
    return sql+'COMMIT;\n'

def detach(catalog):
    specs={name:spec for name,spec in m.table_specs(catalog).items() if name!='_auth_users'}
    sql="""-- Stop capture and revoke its reader access; retain all events and receipts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $timeout$ BEGIN
 IF current_setting('transaction_timeout',true) IS NOT NULL THEN PERFORM set_config('transaction_timeout','30s',true); END IF;
END $timeout$;
DO $guard$ BEGIN
 IF (SELECT obj_description(oid,'pg_namespace') FROM pg_namespace WHERE nspname='d1_migration') IS DISTINCT FROM 'pmrfp-d1-change-capture-v1; reviewed 2026-10-31' THEN
  RAISE EXCEPTION 'Unrecognized migration schema';
 END IF;
END $guard$;
"""
    sql+='LOCK TABLE '+','.join('public.'+m.ident(t) for t in sorted(specs))+' IN SHARE ROW EXCLUSIVE MODE NOWAIT;\n'
    sql+="DO $detach$ DECLARE t text; BEGIN\n FOREACH t IN ARRAY ARRAY["+','.join(map(literal,sorted(specs)))+"] LOOP\n"
    for trigger in ['d1_migration_capture','d1_migration_truncate']:
        sql+=f"  EXECUTE format('DROP TRIGGER IF EXISTS {trigger} ON public.%I',t);\n"
    sql+=" END LOOP;\nEND $detach$;\n"
    sql+=f'''REVOKE EXECUTE ON FUNCTION d1_migration.acknowledge(bigint[],text) FROM {READER};
REVOKE SELECT ON d1_migration.registered_tables,d1_migration.outbox FROM {READER};
REVOKE USAGE ON SCHEMA d1_migration FROM {READER};
COMMIT;
'''
    return sql

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--catalog',default='d1/production-catalog-2026-10-29.json');parser.add_argument('--detach',action='store_true');args=parser.parse_args()
    print((detach if args.detach else generate)(json.loads(Path(args.catalog).read_text())))
