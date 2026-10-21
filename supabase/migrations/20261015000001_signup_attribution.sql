-- ════════════════════════════════════════════════════════════════════
-- Sign-up attribution (first touch) + daily landing counters
-- ════════════════════════════════════════════════════════════════════
--   signup_attribution   one row per account: the page the browser first
--                        landed on, the referring site's HOST only, the
--                        utm_* tags of that visit (and of the last tagged
--                        visit, when different), first-seen day, language,
--                        country code, and the channel classified on the
--                        server (lib/attribution/channel). Copied from the
--                        first-party pmrfp_ft cookie at sign-up and
--                        onboarding (lib/attribution/record). No IP
--                        addresses, no full referrer URLs, no query strings.
--                        Admins read; the app writes with the service role.
--                        Accounts created before this migration have no row
--                        and show as "unknown" in /admin/signups.
--   landing_counts       daily counters of NEW visitors by channel and
--                        landing path. Aggregate only. Written in batches by
--                        record_landings() (service role only). Admin read.
--
-- Safe to re-run.

create table if not exists public.signup_attribution (
  user_id uuid primary key references public.users_profile(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  channel text not null default 'unknown'
    check (channel in ('google_organic', 'bing_organic', 'other_search', 'ai_assistant', 'email', 'social',
                       'paid', 'referral', 'internal', 'direct', 'other', 'unknown')),
  landing_path text check (landing_path is null or (char_length(landing_path) <= 200 and landing_path ~ '^/')),
  referrer_host text check (referrer_host is null or referrer_host ~ '^[a-z0-9.-]{1,100}$'),
  utm_source text check (utm_source is null or char_length(utm_source) <= 80),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 80),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 80),
  utm_content text check (utm_content is null or char_length(utm_content) <= 80),
  last_utm_source text check (last_utm_source is null or char_length(last_utm_source) <= 80),
  last_utm_medium text check (last_utm_medium is null or char_length(last_utm_medium) <= 80),
  last_utm_campaign text check (last_utm_campaign is null or char_length(last_utm_campaign) <= 80),
  last_utm_content text check (last_utm_content is null or char_length(last_utm_content) <= 80),
  last_touch_at date,
  first_seen date,
  signed_up_at timestamptz not null default now(),
  lang text check (lang is null or lang in ('en', 'fr', 'es')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  method text check (method is null or method in ('email', 'google')),
  created_at timestamptz not null default now()
);
create index if not exists signup_attribution_signed_up_idx on public.signup_attribution (signed_up_at desc);
create index if not exists signup_attribution_org_idx on public.signup_attribution (org_id);

alter table public.signup_attribution enable row level security;
drop policy if exists "signup attribution admin read" on public.signup_attribution;
create policy "signup attribution admin read" on public.signup_attribution
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.signup_attribution from anon;
revoke insert, update, delete on public.signup_attribution from authenticated;

-- ── Daily landing counters (aggregate) ──
create table if not exists public.landing_counts (
  day date not null,
  channel text not null check (char_length(channel) between 1 and 40),
  landing_path text not null default '' check (char_length(landing_path) <= 120),
  visits integer not null default 0 check (visits >= 0),
  primary key (day, channel, landing_path)
);
create index if not exists landing_counts_day_idx on public.landing_counts (day desc);

alter table public.landing_counts enable row level security;
drop policy if exists "landing counts admin read" on public.landing_counts;
create policy "landing counts admin read" on public.landing_counts
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.landing_counts from anon;
revoke insert, update, delete on public.landing_counts from authenticated;

-- [{"day":"2026-10-15","channel":"google_organic","path":"/rfps","n":4}, …]
create or replace function public.record_landings(p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.landing_counts as l (day, channel, landing_path, visits)
  -- Same key twice in one batch is summed first (ON CONFLICT can't touch a row twice).
  select day, channel, landing_path, sum(n)::int
  from (
    select
      coalesce((r->>'day')::date, (now() at time zone 'America/Toronto')::date) as day,
      left(r->>'channel', 40) as channel,
      left(coalesce(r->>'path', ''), 120) as landing_path,
      greatest(0, least(100000, coalesce((r->>'n')::int, 0))) as n
    from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as r
    where coalesce(r->>'channel', '') <> ''
  ) x
  group by day, channel, landing_path
  on conflict (day, channel, landing_path)
  do update set visits = l.visits + excluded.visits;
$$;
revoke all on function public.record_landings(jsonb) from public;
revoke all on function public.record_landings(jsonb) from anon, authenticated;
grant execute on function public.record_landings(jsonb) to service_role;

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.landing_counts to service_role;
grant select, insert, update, delete on public.signup_attribution to service_role;
grant select on public.signup_attribution to authenticated;
grant select on public.landing_counts to authenticated;
