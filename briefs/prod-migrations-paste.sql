-- ════════════════════════════════════════════════════════════════════
-- PMRFP — PROD migration paste block (run in Supabase → SQL Editor)
-- Safe to re-run: all drops are IF EXISTS, all creates are IF NOT EXISTS /
-- CREATE OR REPLACE. Covers the three migrations that postdate the last
-- known prod apply:
--   1) 20260531000002  real_estate_agent role
--   2) 20260531000003  rfp 'expired' status
--   3) 20260604000001  geo liquidity + waitlist + notification prefs
-- After running: the founding-region waitlist forms, REA signups, and
-- 'Mark expired' RFP action all work on the live site.
-- ════════════════════════════════════════════════════════════════════

-- ── 1) real_estate_agent role ───────────────────────────────────────
alter table public.users_profile drop constraint if exists users_profile_primary_role_check;
alter table public.users_profile add constraint users_profile_primary_role_check
  check (primary_role in ('trade','property_manager','admin','super_admin','visitor','supplier','real_estate_agent'));

-- ── 2) rfp 'expired' status ─────────────────────────────────────────
alter table public.rfp_posts drop constraint if exists rfp_posts_status_check;
alter table public.rfp_posts add constraint rfp_posts_status_check
  check (status in ('draft','pending_review','published','closed','awarded','expired','archived','rejected'));

-- ── 3) geo liquidity + waitlist + notifications ─────────────────────
alter table public.regions
  add column if not exists status text not null default 'auto'
    check (status in ('auto','active','founding','hidden'));

alter table public.platform_settings
  add column if not exists region_liquidity_threshold integer not null default 3;

create or replace view public.region_category_liquidity as
  select
    oreg.region_id,
    ocat.category_id,
    count(distinct o.id) as paid_org_count
  from public.organizations o
  join public.subscriptions s on s.organization_id = o.id
  join public.organization_regions oreg on oreg.organization_id = o.id
  join public.organization_categories ocat on ocat.organization_id = o.id
  where o.organization_type in ('trade_company','supplier')
    and o.status <> 'suspended'
    and o.profile_status = 'approved'
    and s.status in ('active','comped')
  group by oreg.region_id, ocat.category_id;

create or replace view public.region_liquidity as
  select
    oreg.region_id,
    count(distinct o.id) as paid_org_count
  from public.organizations o
  join public.subscriptions s on s.organization_id = o.id
  join public.organization_regions oreg on oreg.organization_id = o.id
  where o.organization_type in ('trade_company','supplier')
    and o.status <> 'suspended'
    and o.profile_status = 'approved'
    and s.status in ('active','comped')
  group by oreg.region_id;

grant select on public.region_liquidity to anon, authenticated;
grant select on public.region_category_liquidity to anon, authenticated;

create table if not exists public.region_requests (
  id uuid primary key default gen_random_uuid(),
  raw_name text not null,
  normalized_slug text,
  province text,
  country text not null default 'Canada',
  requested_by_user_id uuid references public.users_profile(id) on delete set null,
  suggested_region_id uuid references public.regions(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','approved','merged','rejected')),
  created_region_id uuid references public.regions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists region_requests_status_idx on public.region_requests(status);
create index if not exists region_requests_name_trgm
  on public.region_requests using gin (raw_name gin_trgm_ops);

alter table public.region_requests enable row level security;
drop policy if exists "region_requests insert public" on public.region_requests;
create policy "region_requests insert public" on public.region_requests
  for insert to anon, authenticated with check (true);
drop policy if exists "region_requests read admin" on public.region_requests;
create policy "region_requests read admin" on public.region_requests
  for select to authenticated using (public.is_admin(auth.uid()));
drop policy if exists "region_requests update admin" on public.region_requests;
create policy "region_requests update admin" on public.region_requests
  for update to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create table if not exists public.regional_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text,
  region_id uuid references public.regions(id) on delete set null,
  requested_region_text text,
  province text,
  country text not null default 'Canada',
  category_slug text,
  reason text not null default 'early_access'
    check (reason in ('early_access','founding_region_rfp','no_supply_directory','region_request')),
  user_id uuid references public.users_profile(id) on delete set null,
  ghl_synced boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists regional_waitlist_region_idx on public.regional_waitlist(region_id);
create index if not exists regional_waitlist_country_idx on public.regional_waitlist(country);
create index if not exists regional_waitlist_reason_idx on public.regional_waitlist(reason);

alter table public.regional_waitlist enable row level security;
drop policy if exists "regional_waitlist insert public" on public.regional_waitlist;
create policy "regional_waitlist insert public" on public.regional_waitlist
  for insert to anon, authenticated with check (true);
drop policy if exists "regional_waitlist read own/admin" on public.regional_waitlist;
create policy "regional_waitlist read own/admin" on public.regional_waitlist
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin(auth.uid())
  );
drop policy if exists "regional_waitlist update admin" on public.regional_waitlist;
create policy "regional_waitlist update admin" on public.regional_waitlist
  for update to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users_profile(id) on delete cascade,
  new_rfps text not null default 'daily'
    check (new_rfps in ('instant','daily','weekly','off')),
  interest_updates text not null default 'instant'
    check (interest_updates in ('instant','daily','weekly','off')),
  intro_requests text not null default 'instant'
    check (intro_requests in ('instant','daily','weekly','off')),
  region_activation text not null default 'instant'
    check (region_activation in ('instant','daily','weekly','off')),
  referral_status text not null default 'instant'
    check (referral_status in ('instant','daily','weekly','off')),
  product_news text not null default 'off'
    check (product_news in ('instant','daily','weekly','off')),
  channel_email boolean not null default true,
  channel_inapp boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists notification_preferences_set_updated on public.notification_preferences;
create trigger notification_preferences_set_updated before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
drop policy if exists "notif_prefs own read" on public.notification_preferences;
create policy "notif_prefs own read" on public.notification_preferences
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin(auth.uid())
  );
drop policy if exists "notif_prefs own upsert" on public.notification_preferences;
create policy "notif_prefs own upsert" on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "notif_prefs own update" on public.notification_preferences;
create policy "notif_prefs own update" on public.notification_preferences
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── done ────────────────────────────────────────────────────────────
