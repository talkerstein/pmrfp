-- Metadata only; run as an authorized auditor. No application/auth rows returned.
BEGIN READ ONLY;
SELECT json_build_object(
 'source','production-dashboard-read-only',
 'columns',(SELECT json_agg(x) FROM (SELECT c.table_name,c.column_name,c.ordinal_position,c.data_type,c.udt_name,c.is_nullable,c.column_default,c.is_identity,c.is_generated,c.generation_expression FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.table_name,c.ordinal_position) x),
 'constraints',(SELECT json_agg(x) FROM (SELECT c.conname AS name,t.relname AS table_name,c.contype AS type,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname) x),
 'indexes',(SELECT json_agg(x) FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname) x),
 'policies',(SELECT json_agg(x) FROM (SELECT * FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename,policyname) x),
 'functions',(SELECT json_agg(x) FROM (SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY p.proname) x),
 'triggers',(SELECT json_agg(x) FROM (SELECT t.tgname AS name,c.relname AS table_name,n.nspname AS schema,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth') ORDER BY n.nspname,c.relname,t.tgname) x),
 'event_triggers',(SELECT json_agg(json_build_object('name',evtname,'event',evtevent,'enabled',evtenabled,'function',evtfoid::regproc::text)) FROM pg_event_trigger),
 'views',(SELECT json_agg(x) FROM (SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname) x),
 'buckets',(SELECT json_agg(x) FROM (SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id) x),
 'publications',(SELECT json_agg(x) FROM (SELECT * FROM pg_publication_tables WHERE schemaname='public') x)
) AS catalog;
COMMIT;
