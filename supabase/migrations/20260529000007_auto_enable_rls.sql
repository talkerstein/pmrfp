-- ============================================================
-- 0007 — Defense-in-depth: auto-enable Row Level Security
-- An event trigger that fires after any CREATE TABLE in the public
-- schema and immediately turns on RLS for that table. A new table with
-- RLS on but no policies denies all access by default (fail-closed), so
-- we can never accidentally ship a public table without RLS.
--
-- Note: a newly created table will be locked until you add policies —
-- that is intentional. Add the table's policies in the same migration.
-- ============================================================

create or replace function public.auto_enable_rls()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
      and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security;', obj.object_identity);
  end loop;
end;
$$;

drop event trigger if exists auto_enable_rls_trigger;
create event trigger auto_enable_rls_trigger
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.auto_enable_rls();
