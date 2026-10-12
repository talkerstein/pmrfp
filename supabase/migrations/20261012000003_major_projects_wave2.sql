-- ════════════════════════════════════════════════════════════════════
-- Major projects, wave 2 (builds on 20261012000001_major_projects.sql).
-- CANADA ONLY, as before.
-- ════════════════════════════════════════════════════════════════════
-- 1. status 'application': development applications (rezoning, site plan,
--    development permit) from Toronto, Edmonton, Calgary and York Region.
--    Early signals, usually 1-3 years before construction, rarely valued.
-- 2. source_updated: when the PUBLISHER last updated a record, if it says
--    (BC's Major Projects Inventory stopped at 2024-12-01; its pages show
--    that date instead of our import date).
-- 3. link_group: the same project listed by more than one source (e.g. an
--    Infrastructure Canada funding row and the Québec PQI row, or a
--    Toronto development application and the later building permit). The
--    weekly import sets it to the id of one member of the group. Rows are
--    only LINKED, never merged: each keeps its own facts and licence.
-- Both new columns are appended to major_projects_public.
-- Safe to re-run.

alter table public.major_projects drop constraint if exists major_projects_status_check;
alter table public.major_projects add constraint major_projects_status_check check (status in (
  'application', 'proposed', 'approved', 'under_construction', 'completed', 'on_hold', 'cancelled', 'unknown'
));

alter table public.major_projects add column if not exists source_updated date;
alter table public.major_projects add column if not exists link_group uuid;

create index if not exists major_projects_link_group_idx on public.major_projects(link_group) where link_group is not null;

-- Same view as before, two columns appended (create or replace keeps the
-- existing column order).
create or replace view public.major_projects_public as
  select
    id, slug, source, country, name, description, category, owner, city, province, region_id,
    est_value_cad, size, status, status_raw, status_date, timeline, trades_needed, sources,
    license, evidence, caveats, first_seen, last_seen, stale, stale_since, status_changed_at,
    updated_at,
    (general_contractor is not null) as has_gc,
    (bid_list_url is not null or bid_route is not null) as has_bid_route,
    source_updated,
    link_group
  from public.major_projects
  where public.major_project_is_public(source, approved, review_status);

grant select on public.major_projects_public to anon, authenticated;

-- Verify: projects per status (expect no 'application' rows before the first wave-2 import).
select status, count(*) from public.major_projects group by status order by status;
