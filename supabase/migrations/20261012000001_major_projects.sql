-- ════════════════════════════════════════════════════════════════════
-- Major projects in Canada: large upcoming / ongoing construction projects
-- and how a trade gets on the bid list. CANADA ONLY (country = 'CA').
-- ════════════════════════════════════════════════════════════════════
-- Rows come from two places:
--   1. Open-data importers (weekly cron /api/cron/major-projects, service
--      role): provincial / federal major-project inventories and city
--      building permits >= C$5M. Licensed for reuse (see `license`).
--      Public as soon as they are imported; an admin can hide one by
--      setting review_status = 'rejected' (the importer never resets it).
--   2. Manual research CSVs (source = 'manual'), queued by an admin upload.
--      NOTHING manual is public until an admin approves the row
--      (approved = true). A re-import that changes an approved row sends it
--      back to the queue.
--
-- A row the source stops listing is marked stale (stale = true,
-- stale_since), never deleted.
--
-- Access:
--   major_projects_public  view, anon + authenticated: publishable rows,
--                          WITHOUT the Trade Pro fields (general
--                          contractor, bid-list link, bid route).
--   major_projects         table: Trade Pro members read publishable rows
--                          in full (has_active_trade_access, same rule as
--                          rfp_posts); admins read and edit everything;
--                          writes otherwise service role only.
-- Safe to re-run.

create table if not exists public.major_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,120}$'),
  -- Importer key: 'ab-major-projects', 'permits-toronto', 'manual', …
  source text not null check (source ~ '^[a-z0-9-]{2,40}$'),
  -- Globally unique: '<source>:<id in the source>'.
  source_key text not null unique check (char_length(source_key) between 3 and 200),
  country text not null default 'CA' check (country = 'CA'),
  name text not null check (char_length(name) between 2 and 300),
  description text check (char_length(description) <= 2000),
  category text not null default 'other' check (category in (
    'commercial', 'institutional', 'industrial', 'multi_residential', 'mixed_use',
    'infrastructure', 'energy', 'mining', 'oil_gas', 'data_centre', 'other'
  )),
  owner text check (char_length(owner) <= 300),
  city text check (char_length(city) <= 120),
  province text check (char_length(province) <= 60),
  region_id uuid references public.regions(id) on delete set null,
  est_value_cad numeric(16, 0) check (est_value_cad is null or est_value_cad >= 0),
  size text check (char_length(size) <= 200),
  status text not null default 'unknown' check (status in (
    'proposed', 'approved', 'under_construction', 'completed', 'on_hold', 'cancelled', 'unknown'
  )),
  -- The source's own wording ("Construction Started", "Permit Issued").
  status_raw text check (char_length(status_raw) <= 200),
  status_date date,
  timeline text check (char_length(timeline) <= 500),
  -- Trade Pro fields (not in major_projects_public).
  general_contractor text check (char_length(general_contractor) <= 300),
  bid_list_url text check (bid_list_url is null or bid_list_url ~ '^https?://'),
  bid_route text check (char_length(bid_route) <= 2000),
  -- PMRFP trade slugs (trade_categories.slug) this project needs.
  trades_needed text[] not null default '{}',
  -- [{ "label": "...", "url": "https://..." }] — where the facts come from.
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  -- Licence name + attribution line shown on the page.
  license text not null check (char_length(license) between 2 and 400),
  -- Manual research only: F = page read, S = search summary, A = aggregator.
  evidence text check (evidence is null or evidence in ('F', 'S', 'A')),
  caveats text check (char_length(caveats) <= 2000),
  approved boolean not null default false,
  review_status text not null default 'approved' check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users_profile(id) on delete set null,
  reviewed_at timestamptz,
  first_seen date not null default current_date,
  last_seen date not null default current_date,
  stale boolean not null default false,
  stale_since date,
  previous_status text,
  status_changed_at timestamptz,
  -- Hash of the last imported content: an unchanged source row only bumps
  -- last_seen, so admin edits survive until the source itself changes.
  import_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists major_projects_source_idx on public.major_projects(source);
create index if not exists major_projects_province_idx on public.major_projects(province) where not stale;
create index if not exists major_projects_review_idx on public.major_projects(review_status) where source = 'manual';
create index if not exists major_projects_changed_idx on public.major_projects(status_changed_at);

drop trigger if exists major_projects_updated_at on public.major_projects;
create trigger major_projects_updated_at before update on public.major_projects
  for each row execute function public.set_updated_at();

-- One rule for "the public may see this row": open-data rows unless an admin
-- rejected them; manual rows only once approved.
create or replace function public.major_project_is_public(p_source text, p_approved boolean, p_review_status text)
returns boolean
language sql immutable as $$
  select coalesce(p_review_status, 'pending') <> 'rejected'
     and (p_source <> 'manual' or coalesce(p_approved, false));
$$;

alter table public.major_projects enable row level security;

drop policy if exists "major projects pro read" on public.major_projects;
create policy "major projects pro read" on public.major_projects
  for select to authenticated using (
    public.major_project_is_public(source, approved, review_status)
    and public.has_active_trade_access(auth.uid())
  );

drop policy if exists "major projects admin read" on public.major_projects;
create policy "major projects admin read" on public.major_projects
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "major projects admin write" on public.major_projects;
create policy "major projects admin write" on public.major_projects
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "major projects admin insert" on public.major_projects;
create policy "major projects admin insert" on public.major_projects
  for insert to authenticated with check (public.is_admin(auth.uid()));

-- Public teaser (security definer, like rfp_public): publishable rows only,
-- no Trade Pro fields — just whether they exist.
create or replace view public.major_projects_public as
  select
    id, slug, source, country, name, description, category, owner, city, province, region_id,
    est_value_cad, size, status, status_raw, status_date, timeline, trades_needed, sources,
    license, evidence, caveats, first_seen, last_seen, stale, stale_since, status_changed_at,
    updated_at,
    (general_contractor is not null) as has_gc,
    (bid_list_url is not null or bid_route is not null) as has_bid_route
  from public.major_projects
  where public.major_project_is_public(source, approved, review_status);

grant select on public.major_projects_public to anon, authenticated;
revoke all on public.major_projects from anon;

-- Admin dashboard: one row per source (live / stale / pending / hidden,
-- last import day). Admins only — everyone else gets no rows.
create or replace view public.major_project_source_counts as
  select
    source,
    count(*) filter (where not stale and public.major_project_is_public(source, approved, review_status)) as live,
    count(*) filter (where stale) as stale,
    count(*) filter (where review_status = 'pending') as pending,
    count(*) filter (where review_status = 'rejected') as hidden,
    max(last_seen) as last_seen
  from public.major_projects
  where public.is_admin(auth.uid())
  group by source;

revoke all on public.major_project_source_counts from anon;
grant select on public.major_project_source_counts to authenticated;

-- Verify: expect 0 rows before the first import.
select count(*) as major_projects from public.major_projects;
