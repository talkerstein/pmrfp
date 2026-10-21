-- ════════════════════════════════════════════════════════════════════
-- First-party site tracking: listing views, funnel events, daily traffic
-- ════════════════════════════════════════════════════════════════════
-- No third-party scripts, no new cookies, no IP addresses. Visitors are a
-- 32-character hash of a daily-rotating salt (derived on the server, never
-- stored) and an anonymous browser key, so the same browser can't be linked
-- from one day to the next. Browsers that send Do-Not-Track or Global
-- Privacy Control are never recorded (lib/tracking).
--
--   signup_attribution   gains `role` and `opted_out`, and the sign-up
--                        methods 'password' and 'magic_link' (magic-link and
--                        Google sign-ups never wrote a row before: the row
--                        is now written on every path, lib/attribution).
--   rfp_views            one row per listing per visitor per day (unique
--                        index), written in batches by record_site_beacon().
--                        The old "anyone may insert" policy is dropped: no
--                        browser writes here directly any more.
--   site_events          funnel events (sign-up, onboarding, writer, posts,
--                        pricing, checkout, trials, follows, claims, jobs).
--   site_visitors        one row per visitor-hash per day.
--   site_page_views      daily page views per path and country.
--   site_referrers       daily arrivals per referring domain and country.
--
-- Writes: record_site_beacon() (service role only). Reads: admins (RLS) and
-- site_analytics_report() (service role only, used by /admin/analytics and
-- the weekly admin email). purge_site_tracking() drops anything older than
-- 13 months (weekly cron). Safe to re-run.

-- ── 1. signup_attribution: every path, plus the role ──────────────────
alter table public.signup_attribution add column if not exists role text;
alter table public.signup_attribution add column if not exists opted_out boolean not null default false;
alter table public.signup_attribution drop constraint if exists signup_attribution_method_check;
alter table public.signup_attribution add constraint signup_attribution_method_check
  check (method is null or method in ('email', 'password', 'magic_link', 'google'));
alter table public.signup_attribution drop constraint if exists signup_attribution_role_check;
alter table public.signup_attribution add constraint signup_attribution_role_check
  check (role is null or (char_length(role) <= 40 and role ~ '^[a-z_]+$'));

-- ── 2. rfp_views: one per listing per visitor per day ─────────────────
alter table public.rfp_views add column if not exists view_day date;
alter table public.rfp_views add column if not exists visitor_hash text;
alter table public.rfp_views add column if not exists country text;
alter table public.rfp_views add column if not exists lang text;
alter table public.rfp_views drop constraint if exists rfp_views_visitor_hash_check;
alter table public.rfp_views add constraint rfp_views_visitor_hash_check
  check (visitor_hash is null or visitor_hash ~ '^[0-9a-f]{32}$');
alter table public.rfp_views drop constraint if exists rfp_views_country_check;
alter table public.rfp_views add constraint rfp_views_country_check
  check (country is null or country ~ '^[A-Z]{2}$');
alter table public.rfp_views drop constraint if exists rfp_views_lang_check;
alter table public.rfp_views add constraint rfp_views_lang_check
  check (lang is null or lang in ('en', 'fr', 'es'));
create unique index if not exists rfp_views_daily_visitor_uniq
  on public.rfp_views (rfp_id, view_day, visitor_hash)
  where visitor_hash is not null and view_day is not null;
create index if not exists rfp_views_rfp_day_idx on public.rfp_views (rfp_id, view_day);
create index if not exists rfp_views_created_idx on public.rfp_views (created_at desc);

-- Nothing in the browser writes views any more (the beacon goes through the server).
drop policy if exists "rfp_views insert any" on public.rfp_views;
revoke insert, update, delete on public.rfp_views from anon, authenticated;

-- ── 3. Funnel events ──────────────────────────────────────────────────
create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  event text not null check (event in (
    'signup_started', 'signup_completed', 'onboarding_completed',
    'writer_started', 'writer_draft_generated', 'rfp_posted',
    'pricing_viewed', 'upgrade_clicked', 'checkout_started', 'checkout_completed',
    'trial_started', 'follow_buyer', 'claim_started', 'claim_verified',
    'respond_to_job', 'quote_request_posted'
  )),
  path text check (path is null or (char_length(path) <= 200 and path ~ '^/')),
  lang text check (lang is null or lang in ('en', 'fr', 'es')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  role text check (role is null or (char_length(role) <= 40 and role ~ '^[a-z_]+$')),
  user_id uuid references public.users_profile(id) on delete set null,
  anon_hash text check (anon_hash is null or anon_hash ~ '^[0-9a-f]{32}$'),
  utm_source text check (utm_source is null or char_length(utm_source) <= 80),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 80),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 80),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists site_events_created_idx on public.site_events (created_at desc);
create index if not exists site_events_event_created_idx on public.site_events (event, created_at desc);
create index if not exists site_events_user_idx on public.site_events (user_id) where user_id is not null;

alter table public.site_events enable row level security;
drop policy if exists "site events admin read" on public.site_events;
create policy "site events admin read" on public.site_events
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.site_events from anon;
revoke insert, update, delete on public.site_events from authenticated;

-- ── 4. Daily traffic ──────────────────────────────────────────────────
create table if not exists public.site_visitors (
  day date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{32}$'),
  country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  lang text not null default '' check (lang in ('', 'en', 'fr', 'es')),
  signed_in boolean not null default false,
  primary key (day, visitor_hash)
);
create table if not exists public.site_page_views (
  day date not null,
  path text not null check (char_length(path) between 1 and 200 and path ~ '^/'),
  country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  views integer not null default 0 check (views >= 0),
  primary key (day, path, country)
);
create table if not exists public.site_referrers (
  day date not null,
  referrer_host text not null check (referrer_host ~ '^[a-z0-9.-]{1,100}$'),
  country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  visits integer not null default 0 check (visits >= 0),
  primary key (day, referrer_host, country)
);
create index if not exists site_page_views_day_idx on public.site_page_views (day desc);
create index if not exists site_referrers_day_idx on public.site_referrers (day desc);

alter table public.site_visitors enable row level security;
alter table public.site_page_views enable row level security;
alter table public.site_referrers enable row level security;
drop policy if exists "site visitors admin read" on public.site_visitors;
create policy "site visitors admin read" on public.site_visitors
  for select to authenticated using (public.is_admin(auth.uid()));
drop policy if exists "site page views admin read" on public.site_page_views;
create policy "site page views admin read" on public.site_page_views
  for select to authenticated using (public.is_admin(auth.uid()));
drop policy if exists "site referrers admin read" on public.site_referrers;
create policy "site referrers admin read" on public.site_referrers
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.site_visitors from anon;
revoke all on public.site_page_views from anon;
revoke all on public.site_referrers from anon;
revoke insert, update, delete on public.site_visitors from authenticated;
revoke insert, update, delete on public.site_page_views from authenticated;
revoke insert, update, delete on public.site_referrers from authenticated;

-- ── 5. Batched writer ─────────────────────────────────────────────────
-- p = { visitors: [{day, h, country, lang, signed_in}],
--       pages:    [{day, path, country, n}],
--       referrers:[{day, host, country, n}],
--       views:    [{day, slug, h, user_id, country, lang}],
--       events:   [{event, path, lang, country, role, user_id, anon_hash,
--                   utm_source, utm_medium, utm_campaign, props, at}] }
-- Rows that don't pass the checks are skipped, never the whole batch.
create or replace function public.record_site_beacon(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  day_re constant text := '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$';
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  hash_re constant text := '^[0-9a-f]{32}$';
  arr jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return;
  end if;

  arr := case when jsonb_typeof(p->'visitors') = 'array' then p->'visitors' else '[]'::jsonb end;
  insert into public.site_visitors as v (day, visitor_hash, country, lang, signed_in)
  select distinct on (d, h) d, h, c, l, s
  from (
    select
      (r->>'day')::date as d,
      r->>'h' as h,
      case when coalesce(r->>'country', '') ~ '^[A-Z]{2}$' then r->>'country' else '' end as c,
      case when r->>'lang' in ('en', 'fr', 'es') then r->>'lang' else '' end as l,
      coalesce(r->>'signed_in', 'false') = 'true' as s
    from jsonb_array_elements(arr) as r
    where coalesce(r->>'day', '') ~ day_re and coalesce(r->>'h', '') ~ hash_re
  ) x
  order by d, h, s desc
  on conflict (day, visitor_hash) do update set signed_in = v.signed_in or excluded.signed_in;

  arr := case when jsonb_typeof(p->'pages') = 'array' then p->'pages' else '[]'::jsonb end;
  insert into public.site_page_views as pv (day, path, country, views)
  select d, path, c, sum(n)::int
  from (
    select
      (r->>'day')::date as d,
      left(r->>'path', 200) as path,
      case when coalesce(r->>'country', '') ~ '^[A-Z]{2}$' then r->>'country' else '' end as c,
      greatest(0, least(100000, coalesce((r->>'n')::int, 0))) as n
    from jsonb_array_elements(arr) as r
    where coalesce(r->>'day', '') ~ day_re and coalesce(r->>'path', '') ~ '^/' and coalesce(r->>'n', '') ~ '^\d{1,6}$'
  ) x
  group by d, path, c
  on conflict (day, path, country) do update set views = pv.views + excluded.views;

  arr := case when jsonb_typeof(p->'referrers') = 'array' then p->'referrers' else '[]'::jsonb end;
  insert into public.site_referrers as sr (day, referrer_host, country, visits)
  select d, host, c, sum(n)::int
  from (
    select
      (r->>'day')::date as d,
      r->>'host' as host,
      case when coalesce(r->>'country', '') ~ '^[A-Z]{2}$' then r->>'country' else '' end as c,
      greatest(0, least(100000, coalesce((r->>'n')::int, 0))) as n
    from jsonb_array_elements(arr) as r
    where coalesce(r->>'day', '') ~ day_re and coalesce(r->>'host', '') ~ '^[a-z0-9.-]{1,100}$' and coalesce(r->>'n', '') ~ '^\d{1,6}$'
  ) x
  group by d, host, c
  on conflict (day, referrer_host, country) do update set visits = sr.visits + excluded.visits;

  -- Listing views. The poster's own views and admins' don't count as reach.
  arr := case when jsonb_typeof(p->'views') = 'array' then p->'views' else '[]'::jsonb end;
  insert into public.rfp_views (rfp_id, viewed_by_user_id, organization_id, view_day, visitor_hash, country, lang)
  select distinct on (rp.id, x.d, x.h)
    rp.id, u.id, m.organization_id, x.d, x.h, x.c, x.l
  from (
    select
      (r->>'day')::date as d,
      r->>'slug' as slug,
      r->>'h' as h,
      case when coalesce(r->>'user_id', '') ~ uuid_re then (r->>'user_id')::uuid end as uid,
      case when coalesce(r->>'country', '') ~ '^[A-Z]{2}$' then r->>'country' end as c,
      case when r->>'lang' in ('en', 'fr', 'es') then r->>'lang' end as l
    from jsonb_array_elements(arr) as r
    where coalesce(r->>'day', '') ~ day_re and coalesce(r->>'h', '') ~ hash_re and coalesce(r->>'slug', '') ~ '^[A-Za-z0-9-]{1,200}$'
  ) x
  join public.rfp_posts rp on rp.slug = x.slug
  left join public.users_profile u on u.id = x.uid
  left join lateral (
    select om.organization_id from public.organization_members om where om.user_id = u.id limit 1
  ) m on true
  where (u.id is null or (rp.posted_by_user_id is distinct from u.id and u.primary_role not in ('admin', 'super_admin')))
  on conflict (rfp_id, view_day, visitor_hash) where visitor_hash is not null and view_day is not null do nothing;

  arr := case when jsonb_typeof(p->'events') = 'array' then p->'events' else '[]'::jsonb end;
  insert into public.site_events (event, path, lang, country, role, user_id, anon_hash, utm_source, utm_medium, utm_campaign, props, created_at)
  select
    x.event,
    x.path,
    x.lang,
    -- No request country (the Stripe webhook): the member's company country.
    coalesce(x.country, oc.cc),
    coalesce(x.role, case when u.primary_role ~ '^[a-z_]{1,40}$' then u.primary_role end),
    u.id,
    x.anon_hash,
    x.utm_source,
    x.utm_medium,
    x.utm_campaign,
    x.props,
    x.at
  from (
    select
      e->>'event' as event,
      case when coalesce(e->>'path', '') ~ '^/' then left(e->>'path', 200) end as path,
      case when e->>'lang' in ('en', 'fr', 'es') then e->>'lang' end as lang,
      case when coalesce(e->>'country', '') ~ '^[A-Z]{2}$' then e->>'country' end as country,
      case when coalesce(e->>'role', '') ~ '^[a-z_]{1,40}$' then e->>'role' end as role,
      case when coalesce(e->>'user_id', '') ~ uuid_re then (e->>'user_id')::uuid end as uid,
      case when coalesce(e->>'anon_hash', '') ~ hash_re then e->>'anon_hash' end as anon_hash,
      nullif(left(e->>'utm_source', 80), '') as utm_source,
      nullif(left(e->>'utm_medium', 80), '') as utm_medium,
      nullif(left(e->>'utm_campaign', 80), '') as utm_campaign,
      case when jsonb_typeof(e->'props') = 'object' and octet_length((e->'props')::text) <= 1000 then e->'props' else '{}'::jsonb end as props,
      case
        when coalesce(e->>'at', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
          then least(now(), greatest(now() - interval '1 day', (e->>'at')::timestamptz))
        else now()
      end as at
    from jsonb_array_elements(arr) as e
    where e->>'event' in (
      'signup_started', 'signup_completed', 'onboarding_completed',
      'writer_started', 'writer_draft_generated', 'rfp_posted',
      'pricing_viewed', 'upgrade_clicked', 'checkout_started', 'checkout_completed',
      'trial_started', 'follow_buyer', 'claim_started', 'claim_verified',
      'respond_to_job', 'quote_request_posted'
    )
  ) x
  left join public.users_profile u on u.id = x.uid
  left join lateral (
    select case o.country when 'Canada' then 'CA' when 'United States' then 'US' end as cc
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = u.id
    limit 1
  ) oc on x.country is null;
end;
$$;
revoke all on function public.record_site_beacon(jsonb) from public;
revoke all on function public.record_site_beacon(jsonb) from anon, authenticated;
grant execute on function public.record_site_beacon(jsonb) to service_role;

-- ── 6. Retention: 13 months ───────────────────────────────────────────
create or replace function public.purge_site_tracking(p_months integer default 13)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Never shorter than 13 months, whatever the caller passes.
  cutoff timestamptz := now() - make_interval(months => greatest(13, coalesce(p_months, 13)));
  n_events integer;
  n_visitors integer;
  n_pages integer;
  n_referrers integer;
  n_views integer;
begin
  delete from public.site_events where created_at < cutoff;
  get diagnostics n_events = row_count;
  delete from public.site_visitors where day < cutoff::date;
  get diagnostics n_visitors = row_count;
  delete from public.site_page_views where day < cutoff::date;
  get diagnostics n_pages = row_count;
  delete from public.site_referrers where day < cutoff::date;
  get diagnostics n_referrers = row_count;
  -- Only the per-visitor rows this tracking writes.
  delete from public.rfp_views where visitor_hash is not null and created_at < cutoff;
  get diagnostics n_views = row_count;
  return jsonb_build_object('cutoff', cutoff, 'events', n_events, 'visitors', n_visitors, 'pages', n_pages, 'referrers', n_referrers, 'views', n_views);
end;
$$;
revoke all on function public.purge_site_tracking(integer) from public;
revoke all on function public.purge_site_tracking(integer) from anon, authenticated;
grant execute on function public.purge_site_tracking(integer) to service_role;

-- ── 7. Aggregated report (admin page + weekly email) ──────────────────
-- Everything grouped in SQL: never a full table load. Markets: CA, US, other.
create or replace function public.site_analytics_report(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with rng as (
    select greatest(least(p_from, p_to), p_to - 400) as f, p_to as t
  ),
  daily as (
    select coalesce(v.day, pv.day) as day, coalesce(v.market, pv.market) as market,
      coalesce(v.visitors, 0) as visitors, coalesce(pv.views, 0) as page_views
    from (
      select day, case country when 'CA' then 'CA' when 'US' then 'US' else 'other' end as market, count(*)::int as visitors
      from public.site_visitors, rng where day between rng.f and rng.t group by 1, 2
    ) v
    full join (
      select day, case country when 'CA' then 'CA' when 'US' then 'US' else 'other' end as market, sum(views)::int as views
      from public.site_page_views, rng where day between rng.f and rng.t group by 1, 2
    ) pv on pv.day = v.day and pv.market = v.market
  ),
  pages as (
    select market, path, views from (
      select market, path, views, row_number() over (partition by market order by views desc, path) as rk
      from (
        select case country when 'CA' then 'CA' when 'US' then 'US' else 'other' end as market, path, sum(views)::int as views
        from public.site_page_views, rng where day between rng.f and rng.t group by 1, 2
      ) a
    ) b where rk <= 15
  ),
  refs as (
    select market, host, visits from (
      select market, host, visits, row_number() over (partition by market order by visits desc, host) as rk
      from (
        select case country when 'CA' then 'CA' when 'US' then 'US' else 'other' end as market, referrer_host as host, sum(visits)::int as visits
        from public.site_referrers, rng where day between rng.f and rng.t group by 1, 2
      ) a
    ) b where rk <= 15
  ),
  signups as (
    select case sa.country when 'CA' then 'CA' when 'US' then 'US' else 'other' end as market,
      sa.channel, coalesce(sa.method, 'unknown') as method, coalesce(sa.role, up.primary_role, 'unknown') as role, count(*)::int as n
    from public.signup_attribution sa
    left join public.users_profile up on up.id = sa.user_id
    , rng
    where sa.signed_up_at >= rng.f and sa.signed_up_at < rng.t + 1
    group by 1, 2, 3, 4
  ),
  accounts as (
    select count(*)::int as total,
      count(*) filter (where sa.user_id is null)::int as without_row
    from public.users_profile up
    left join public.signup_attribution sa on sa.user_id = up.id
    , rng
    where up.created_at >= rng.f and up.created_at < rng.t + 1
      and up.primary_role not in ('admin', 'super_admin')
  ),
  events as (
    select case e.country when 'CA' then 'CA' when 'US' then 'US' else 'other' end as market,
      e.event,
      case
        when e.role in ('trade', 'supplier') then 'trade'
        when e.role in ('property_manager', 'real_estate_agent') then 'pm'
        when e.role = 'public_buyer' then 'town'
        else 'other'
      end as role_group,
      count(distinct coalesce(e.user_id::text, e.anon_hash, e.id::text))::int as actors,
      count(*)::int as n
    from public.site_events e, rng
    where e.created_at >= rng.f and e.created_at < rng.t + 1
    group by 1, 2, 3
  )
  select jsonb_build_object(
    'from', (select f from rng),
    'to', (select t from rng),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'market', market, 'visitors', visitors, 'page_views', page_views) order by day, market) from daily), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'path', path, 'views', views) order by market, views desc, path) from pages), '[]'::jsonb),
    'top_referrers', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'host', host, 'visits', visits) order by market, visits desc, host) from refs), '[]'::jsonb),
    'signups', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'channel', channel, 'method', method, 'role', role, 'n', n)) from signups), '[]'::jsonb),
    'accounts', (select jsonb_build_object('total', total, 'without_row', without_row) from accounts),
    'events', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'event', event, 'role_group', role_group, 'actors', actors, 'n', n)) from events), '[]'::jsonb)
  );
$$;
revoke all on function public.site_analytics_report(date, date) from public;
revoke all on function public.site_analytics_report(date, date) from anon, authenticated;
grant execute on function public.site_analytics_report(date, date) to service_role;

-- ── Explicit Data API access ──────────────────────────────────────────
grant select, insert, update, delete on public.site_events to service_role;
grant usage, select on sequence public.site_events_id_seq to service_role;
grant select, insert, update, delete on public.site_visitors to service_role;
grant select, insert, update, delete on public.site_page_views to service_role;
grant select, insert, update, delete on public.site_referrers to service_role;
grant select, insert, update, delete on public.rfp_views to service_role;
grant select on public.site_events to authenticated;
grant select on public.site_visitors to authenticated;
grant select on public.site_page_views to authenticated;
grant select on public.site_referrers to authenticated;
