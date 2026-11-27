"""Generate reviewed SELECT/capture extension for explicitly audited new tables."""
import json
import change_capture as c
import migrate as m
APPROVAL='__APPROVE_CAPTURE_EXTENSION_20261105__'

def generate(old,new):
    before={t:s for t,s in m.table_specs(old).items() if t!='_auth_users'}
    after={t:s for t,s in m.table_specs(new).items() if t!='_auth_users'}
    added=sorted(set(after)-set(before))
    if not added or set(before)-set(after) or any(before[t]['pk']!=after[t]['pk'] for t in before):raise ValueError('Extension requires additive tables and unchanged existing keys')
    registry=lambda specs:[{'table':t,'pk':specs[t]['pk']} for t in sorted(specs)]
    actual="(SELECT jsonb_agg(jsonb_build_object('table',t.tablename,'pk',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.conrelid=format('%I.%I',t.schemaname,t.tablename)::regclass AND c.contype='p')) ORDER BY t.tablename) FROM pg_tables t WHERE t.schemaname='public')"
    sql=f'''-- REVIEW ONLY. New SELECT grants and key-only capture triggers; explicit approval required.
-- No application rows are rewritten. New table writes briefly wait for installation;
-- afterward, a queue failure also fails the corresponding source write.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF '{APPROVAL}'<>'approved-capture-extension-v1' THEN RAISE EXCEPTION 'Review-only capture extension requires approval'; END IF;
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed owner required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{c.READER}' AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolbypassrls AND rolconnlimit=3 AND rolvaliduntil='{c.EXPIRY}'::timestamptz) OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='{c.READER}')) THEN RAISE EXCEPTION 'Reader boundary changed'; END IF;
 IF (SELECT obj_description(oid,'pg_namespace') FROM pg_namespace WHERE nspname='d1_migration') IS DISTINCT FROM 'pmrfp-d1-change-capture-v1; reviewed 2026-10-31' THEN RAISE EXCEPTION 'Private schema changed'; END IF;
 IF ({c.function_guard(new)}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Reviewed capture functions changed'; END IF;
 IF {actual} IS DISTINCT FROM {c.literal(m.canonical(registry(after)))}::jsonb THEN RAISE EXCEPTION 'Audited source key inventory changed'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('table',table_name,'pk',pk_columns) ORDER BY table_name) FROM d1_migration.registered_tables) IS DISTINCT FROM {c.literal(m.canonical(registry(before)))}::jsonb THEN RAISE EXCEPTION 'Registered baseline changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege('{c.READER}',format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN RAISE EXCEPTION 'Unexpected application writes'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname=ANY(ARRAY[{','.join(map(c.literal,added))}]) AND NOT r.relrowsecurity) THEN RAISE EXCEPTION 'New application table lacks RLS'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger g JOIN pg_class r ON r.oid=g.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname=ANY(ARRAY[{','.join(map(c.literal,added))}]) AND g.tgname IN ('d1_migration_capture','d1_migration_truncate')) THEN RAISE EXCEPTION 'New table already has capture'; END IF;
END $guard$;
LOCK TABLE {','.join('public.'+m.ident(t) for t in added)} IN SHARE ROW EXCLUSIVE MODE NOWAIT;
'''
    for t in added:
        sql+=f"INSERT INTO d1_migration.registered_tables VALUES({c.literal(t)},ARRAY[{','.join(map(c.literal,after[t]['pk']))}]);\n"
        sql+=f'GRANT SELECT ON public.{m.ident(t)} TO {c.READER};\n'
        sql+=f'CREATE TRIGGER d1_migration_capture AFTER INSERT OR UPDATE OR DELETE ON public.{m.ident(t)} FOR EACH ROW EXECUTE FUNCTION d1_migration.capture_row();\n'
        sql+=f'CREATE TRIGGER d1_migration_truncate AFTER TRUNCATE ON public.{m.ident(t)} FOR EACH STATEMENT EXECUTE FUNCTION d1_migration.capture_truncate();\n'
    return sql+'COMMIT;\n'

if __name__=='__main__':
    from pathlib import Path
    old=json.loads((m.ROOT/'d1/production-catalog-2026-10-29.json').read_text());new=json.loads((m.ROOT/'.d1-private/catalog-20261105.json').read_text())
    with (m.ROOT/'d1/capture-extension-proposal-2026-11-05.sql').open('x') as stream:stream.write(generate(old,new))
    print('Review-only extension saved; no database changes made.')
