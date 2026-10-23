-- ════════════════════════════════════════════════════════════════════
-- Open data, batch 1: tables for the first filtered open-data imports.
-- ════════════════════════════════════════════════════════════════════
-- Size budget: this batch adds well under 150 MB in total (Supabase Pro,
-- spend cap ON). Every importer filters before it writes; the per-source
-- row and byte estimates are in src/lib/open-data/sources.ts.
--
--  1. award_history gets two columns: non_competitive (sole-source awards are
--     history only and never feed a price median) and procurement_method.
--     award_history_intel_slice() returns them.
--  2. permit_leads: who is building what, lately (city building permits,
--     24 months, >= $100K, business contractor only). NO address, applicant,
--     owner or free text: those can name a homeowner.
--  3. contractor_activity: Calgary's top contractors per trade (HVAC,
--     electrical, plumbing), aggregated on the publisher's side; ~150 rows.
--  4. planned_procurements: the City of Toronto capital project pipeline.
--  5. open_data_runs: one row per source, last run (admin page).
--  6. open_data_footprint(): measured rows and bytes, for the admin page.
--
-- Nothing here is readable by the browser: RLS is on and there are no
-- policies, so only the service role (server code) reads and writes. Pages
-- read them server side with long caches. Safe to re-run.

-- ── 1. award_history ────────────────────────────────────────────────
alter table public.award_history add column if not exists non_competitive boolean not null default false;
alter table public.award_history add column if not exists procurement_method text
  check (procurement_method is null or length(procurement_method) <= 60);

create or replace function public.award_history_intel_slice(p_country text, p_since date, p_limit integer default 30000)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) - 'running' order by x.award_date desc, x.id), '[]'::jsonb)
  from (
    select h.id, h.source, h.board_ref, h.title, h.buyer, h.winner_business_name, h.winner_is_individual,
           h.value, h.currency, h.country, h.province, h.city, h.award_date, h.end_date, h.end_date_source,
           h.potential_end_date, h.number_of_bids, h.trade_slugs, h.notice_url, h.attribution,
           h.non_competitive, h.procurement_method,
           exists (select 1 from public.bid_results b where b.award_history_id = h.id) as has_bids,
           coalesce(h.end_date >= current_date - 365, false) as running
    from public.award_history h
    where h.country = p_country
      and (h.award_date >= p_since or h.end_date >= current_date - 365)
    order by running desc, h.award_date desc, h.id
    limit least(greatest(coalesce(p_limit, 30000), 1), 60000)
  ) x;
$$;

revoke all on function public.award_history_intel_slice(text, date, integer) from public;
revoke all on function public.award_history_intel_slice(text, date, integer) from anon, authenticated;
grant execute on function public.award_history_intel_slice(text, date, integer) to service_role;

-- ── 2. permit_leads ─────────────────────────────────────────────────
create table if not exists public.permit_leads (
  id bigint generated always as identity primary key,
  source text not null check (source ~ '^[a-z0-9-]{2,40}$'),
  -- The city's permit number: the stable id, so a re-run updates in place.
  source_key text not null check (length(source_key) between 1 and 120),
  city text not null check (length(city) between 2 and 60),
  province text not null check (length(province) between 2 and 40),
  issued_on date not null,
  value_cad numeric(14, 0) not null check (value_cad >= 0),
  -- A business only (businessOnly(), src/lib/open-data/business-name.mjs).
  contractor text not null check (length(contractor) between 2 and 160),
  contractor_key text not null check (length(contractor_key) between 1 and 160),
  work_type text check (work_type is null or length(work_type) <= 80),
  as_of date not null,
  unique (source, source_key)
);

-- The only read path: a city's newest permits (the "recent permits" strip).
create index if not exists permit_leads_city_issued_idx on public.permit_leads (city, issued_on desc);

-- ── 3. contractor_activity ──────────────────────────────────────────
create table if not exists public.contractor_activity (
  id bigint generated always as identity primary key,
  source text not null check (source ~ '^[a-z0-9-]{2,40}$'),
  city text not null,
  province text not null,
  trade_slug text not null check (trade_slug ~ '^[a-z0-9-]{2,60}$'),
  rank smallint not null check (rank between 1 and 100),
  contractor text not null check (length(contractor) between 2 and 160),
  contractor_key text not null check (length(contractor_key) between 1 and 160),
  permits integer not null check (permits >= 0),
  -- Null when the source has no project cost (Calgary's trade-permit datasets have none).
  declared_value_cad numeric(16, 0) check (declared_value_cad is null or declared_value_cad >= 0),
  window_start date not null,
  window_end date not null,
  as_of date not null,
  unique (source, city, trade_slug, contractor_key)
);

create index if not exists contractor_activity_city_trade_idx on public.contractor_activity (city, trade_slug, rank);

-- ── 4. planned_procurements ─────────────────────────────────────────
create table if not exists public.planned_procurements (
  id bigint generated always as identity primary key,
  source text not null check (source ~ '^[a-z0-9-]{2,40}$'),
  source_key text not null check (length(source_key) between 1 and 200),
  -- buyerKey() of the buyer, to match a buyer page.
  buyer_key text not null,
  buyer_name text not null,
  city text not null,
  province text not null,
  title text not null check (length(title) between 1 and 300),
  type_of_work text check (type_of_work is null or length(type_of_work) <= 60),
  scope text check (scope is null or length(scope) <= 600),
  division text check (division is null or length(division) <= 100),
  sourcing_year smallint,
  award_year smallint,
  sourcing_type text check (sourcing_type is null or length(sourcing_type) <= 30),
  estimated_range text check (estimated_range is null or length(estimated_range) <= 40),
  term_months smallint,
  licence text not null,
  as_of date not null,
  unique (source, source_key)
);

create index if not exists planned_procurements_buyer_idx on public.planned_procurements (buyer_key, sourcing_year);

-- ── 5. open_data_runs ───────────────────────────────────────────────
create table if not exists public.open_data_runs (
  source text primary key check (source ~ '^[a-z0-9-]{2,40}$'),
  last_run_at timestamptz not null default now(),
  last_status text not null check (last_status in ('ok', 'dry', 'error')),
  rows_read integer not null default 0,
  rows_kept integer not null default 0,
  rows_written integer not null default 0,
  note text check (note is null or length(note) <= 500)
);

-- ── Row level security: server only ─────────────────────────────────
alter table public.permit_leads enable row level security;
alter table public.contractor_activity enable row level security;
alter table public.planned_procurements enable row level security;
alter table public.open_data_runs enable row level security;

revoke all on public.permit_leads from anon, authenticated;
revoke all on public.contractor_activity from anon, authenticated;
revoke all on public.planned_procurements from anon, authenticated;
revoke all on public.open_data_runs from anon, authenticated;

grant select, insert, update, delete on public.permit_leads to service_role;
grant select, insert, update, delete on public.contractor_activity to service_role;
grant select, insert, update, delete on public.planned_procurements to service_role;
grant select, insert, update, delete on public.open_data_runs to service_role;

-- ── 6. open_data_footprint() ────────────────────────────────────────
-- Measured, not estimated: rows and total bytes (heap + indexes) of each
-- table, and the heap bytes award_history holds per source. Admin page only.
create or replace function public.open_data_footprint()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'tables', jsonb_build_object(
      'permit_leads', jsonb_build_object('rows', (select count(*) from public.permit_leads), 'bytes', pg_total_relation_size('public.permit_leads')),
      'contractor_activity', jsonb_build_object('rows', (select count(*) from public.contractor_activity), 'bytes', pg_total_relation_size('public.contractor_activity')),
      'planned_procurements', jsonb_build_object('rows', (select count(*) from public.planned_procurements), 'bytes', pg_total_relation_size('public.planned_procurements')),
      'award_history', jsonb_build_object('rows', (select count(*) from public.award_history), 'bytes', pg_total_relation_size('public.award_history')),
      'bid_results', jsonb_build_object('rows', (select count(*) from public.bid_results), 'bytes', pg_total_relation_size('public.bid_results'))
    ),
    'award_history_by_source', (
      select coalesce(jsonb_object_agg(source, jsonb_build_object('rows', n, 'heap_bytes', b)), '{}'::jsonb)
      from (select h.source, count(*) as n, sum(pg_column_size(h.*))::bigint as b from public.award_history h group by h.source) x
    ),
    'database_bytes', pg_database_size(current_database())
  );
$$;

revoke all on function public.open_data_footprint() from public;
revoke all on function public.open_data_footprint() from anon, authenticated;
grant execute on function public.open_data_footprint() to service_role;

-- Verify: expect 0 for each right after the first run.
select (select count(*) from public.permit_leads) as permit_leads,
       (select count(*) from public.contractor_activity) as contractor_activity,
       (select count(*) from public.planned_procurements) as planned_procurements;
