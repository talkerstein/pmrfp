-- ════════════════════════════════════════════════════════════════════
-- Paid sponsorships by trade × province/state (+ national, + email-only)
-- ════════════════════════════════════════════════════════════════════
-- Sold on /advertise, managed in /admin/sponsors. One row per sponsorship.
-- Exclusivity (one sponsor per country × trade × province × channel) is
-- enforced by the app on approve (lib/sponsors/model findConflicts), with
-- the slot rules in one tested place.
--
--   sponsors            admins only (RLS). Contact, notes, Stripe ids.
--   sponsors_public     view, anon + authenticated: rows that hold a slot
--                       (pending / approved / paused). Creative fields only
--                       for approved rows; nothing private.
--   sponsor_impressions daily counters, written in batches by
--                       record_sponsor_impressions() (service role only).
--   sponsor_clicks      gains a region column (province/state slug).
--
-- Safe to re-run.

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$' and slug not in ('maple', 'cleverpays', 'talkerstein')),
  name text not null check (char_length(name) between 1 and 120),
  logo_url text check (logo_url is null or (char_length(logo_url) <= 500 and (logo_url ~ '^https://' or logo_url ~ '^/'))),
  url text not null check (char_length(url) <= 500 and url ~ '^https://'),
  headline text not null default '' check (char_length(headline) <= 70),
  message text not null default '' check (char_length(message) <= 180),
  cta text not null default '' check (char_length(cta) <= 28),
  headline_fr text check (headline_fr is null or char_length(headline_fr) <= 70),
  message_fr text check (message_fr is null or char_length(message_fr) <= 180),
  cta_fr text check (cta_fr is null or char_length(cta_fr) <= 28),
  tier text not null check (tier in ('province', 'national', 'digest')),
  country text not null check (country in ('CA', 'US')),
  trades text[] not null check (cardinality(trades) between 1 and 10),
  regions text[] not null default '{}',
  start_date date,
  end_date date,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'paused', 'ended', 'rejected')),
  monthly_price numeric(10, 2),
  currency text check (currency is null or currency in ('CAD', 'USD')),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 200),
  notes text check (notes is null or char_length(notes) <= 4000),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  reviewed_by uuid references public.users_profile(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- National covers the whole country; the other tiers name provinces/states.
  constraint sponsors_regions_by_tier check ((tier = 'national') = (cardinality(regions) = 0)),
  constraint sponsors_dates check (end_date is null or start_date is null or end_date >= start_date),
  -- Live means reviewed copy: an approved row always has a message.
  constraint sponsors_approved_copy check (
    status <> 'approved' or (char_length(headline) > 0 and char_length(message) > 0 and char_length(cta) > 0 and start_date is not null)
  )
);

create index if not exists sponsors_status_idx on public.sponsors(status);
create index if not exists sponsors_country_idx on public.sponsors(country);

drop trigger if exists sponsors_set_updated on public.sponsors;
create trigger sponsors_set_updated before update on public.sponsors
  for each row execute function public.set_updated_at();

alter table public.sponsors enable row level security;

drop policy if exists "sponsors admin read" on public.sponsors;
create policy "sponsors admin read" on public.sponsors
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "sponsors admin insert" on public.sponsors;
create policy "sponsors admin insert" on public.sponsors
  for insert to authenticated with check (public.is_admin(auth.uid()));

drop policy if exists "sponsors admin update" on public.sponsors;
create policy "sponsors admin update" on public.sponsors
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "sponsors admin delete" on public.sponsors;
create policy "sponsors admin delete" on public.sponsors
  for delete to authenticated using (public.is_admin(auth.uid()));

revoke all on public.sponsors from anon;

-- Public slice (security definer, like rfp_public): what's needed to show a
-- live sponsor and to say which slots are taken. Pending/paused rows show
-- only their slot (no name, no copy). Ended a while ago = gone.
create or replace view public.sponsors_public as
  select
    id, slug, tier, country, trades, regions, start_date, end_date, status,
    case when status = 'approved' then name end as name,
    case when status = 'approved' then logo_url end as logo_url,
    case when status = 'approved' then url end as url,
    case when status = 'approved' then headline end as headline,
    case when status = 'approved' then message end as message,
    case when status = 'approved' then cta end as cta,
    case when status = 'approved' then headline_fr end as headline_fr,
    case when status = 'approved' then message_fr end as message_fr,
    case when status = 'approved' then cta_fr end as cta_fr
  from public.sponsors
  where status in ('pending', 'approved', 'paused')
    and (end_date is null or end_date >= (now() at time zone 'America/Toronto')::date - 1);

grant select on public.sponsors_public to anon, authenticated;

-- ── Impressions: one row per day × sponsor × placement × trade × region ──
create table if not exists public.sponsor_impressions (
  day date not null,
  sponsor text not null check (char_length(sponsor) <= 40),
  placement text not null check (char_length(placement) <= 40),
  trade text not null default '' check (char_length(trade) <= 60),
  region text not null default '' check (char_length(region) <= 60),
  impressions integer not null default 0 check (impressions >= 0),
  primary key (day, sponsor, placement, trade, region)
);

alter table public.sponsor_impressions enable row level security;

drop policy if exists "sponsor impressions admin read" on public.sponsor_impressions;
create policy "sponsor impressions admin read" on public.sponsor_impressions
  for select to authenticated using (public.is_admin(auth.uid()));

revoke all on public.sponsor_impressions from anon;

-- Batched upsert: [{"day":"2026-10-12","sponsor":"acme","placement":"rfp_detail","trade":"electrical","region":"ontario","n":12}, …]
-- One call per flush (a server instance buffers counts in memory first).
create or replace function public.record_sponsor_impressions(p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sponsor_impressions as si (day, sponsor, placement, trade, region, impressions)
  -- Same key twice in one batch is summed first (ON CONFLICT can't touch a row twice).
  select day, sponsor, placement, trade, region, sum(n)::int
  from (
    select
      coalesce((r->>'day')::date, (now() at time zone 'America/Toronto')::date) as day,
      left(r->>'sponsor', 40) as sponsor,
      left(r->>'placement', 40) as placement,
      left(coalesce(r->>'trade', ''), 60) as trade,
      left(coalesce(r->>'region', ''), 60) as region,
      greatest(0, least(100000, coalesce((r->>'n')::int, 0))) as n
    from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as r
    where coalesce(r->>'sponsor', '') <> '' and coalesce(r->>'placement', '') <> ''
  ) b
  group by day, sponsor, placement, trade, region
  on conflict (day, sponsor, placement, trade, region)
  do update set impressions = si.impressions + excluded.impressions;
$$;

revoke all on function public.record_sponsor_impressions(jsonb) from public;
revoke all on function public.record_sponsor_impressions(jsonb) from anon, authenticated;
grant execute on function public.record_sponsor_impressions(jsonb) to service_role;

-- ── Clicks: add the province/state ──
alter table public.sponsor_clicks add column if not exists region text not null default '' check (char_length(region) <= 60);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'sponsor_clicks_pkey'
      and conrelid = 'public.sponsor_clicks'::regclass
      and array_length(conkey, 1) = 4
  ) then
    alter table public.sponsor_clicks drop constraint sponsor_clicks_pkey;
    alter table public.sponsor_clicks add primary key (day, sponsor, placement, trade, region);
  end if;
end $$;

-- One function with a defaulted region, so callers that send three
-- arguments (the old /go route during deploy) keep working.
drop function if exists public.record_sponsor_click(text, text, text);
create or replace function public.record_sponsor_click(p_sponsor text, p_placement text, p_trade text default '', p_region text default '')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sponsor_clicks (sponsor, placement, trade, region, clicks)
  values (left(p_sponsor, 40), left(p_placement, 40), left(coalesce(p_trade, ''), 60), left(coalesce(p_region, ''), 60), 1)
  on conflict (day, sponsor, placement, trade, region)
  do update set clicks = public.sponsor_clicks.clicks + 1;
$$;

revoke all on function public.record_sponsor_click(text, text, text, text) from public;
revoke all on function public.record_sponsor_click(text, text, text, text) from anon, authenticated;
grant execute on function public.record_sponsor_click(text, text, text, text) to service_role;

-- Verify: expect 0 sponsors before the first sale.
select count(*) as sponsors from public.sponsors;
