/** Reconstruct the checked-in Postgres schema. Never connects to production. */
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const db = new PGlite();
await db.exec(`
create schema auth; create schema storage;
create role anon; create role authenticated; create role service_role bypassrls;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key, bucket_id text, name text, owner uuid);
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
`);
const files = (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
const adaptations=[];
for (const file of files) {
  let sql=await readFile(`supabase/migrations/${file}`,'utf8');
  // Only unavailable extensions/index access methods are omitted; SQL errors abort.
  sql=sql.replace(/^create extension[^;]*;[^\n]*/gmi, m=>{adaptations.push({file,sql:m});return '';});
  sql=sql.replace(/create (?:unique )?index[^;]*using (?:gin|gist)[^;]*;/gi,m=>{adaptations.push({file,sql:m});return '';});
  try { await db.exec(sql); } catch(e) { console.error(file, e.message); await db.close(); process.exit(1); }
}
const query=async sql=>(await db.query(sql)).rows;
const catalog={source:'repository-reconstruction', migrations:files, adaptations,
 columns:await query(`select c.table_name,c.column_name,c.ordinal_position,c.data_type,c.udt_name,c.is_nullable,c.column_default,c.is_identity,c.is_generated,c.generation_expression from information_schema.columns c join information_schema.tables t using(table_schema,table_name) where c.table_schema='public' and t.table_type='BASE TABLE' order by c.table_name,c.ordinal_position`),
 constraints:await query(`select c.conname as name,t.relname as table_name,c.contype as type, pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' order by t.relname,c.conname`),
 indexes:await query(`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`),
 policies:await query(`select * from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname`),
 functions:await query(`select p.proname as name,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname`),
 triggers:await query(`select t.tgname as name,c.relname as table_name,n.nspname as schema,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal order by n.nspname,c.relname,t.tgname`),
 event_triggers:await query(`select evtname as name,evtevent as event,evtenabled as enabled,evtfoid::regproc::text as function from pg_event_trigger order by evtname`),
 views:await query(`select viewname,definition from pg_views where schemaname='public' order by viewname`),
 buckets:await query(`select * from storage.buckets order by id`)};
await writeFile('d1/postgres-catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({tables:new Set(catalog.columns.map(c=>c.table_name)).size,policies:catalog.policies.length,functions:catalog.functions.length,triggers:catalog.triggers.length,views:catalog.views.length}));
await db.close();
