-- ════════════════════════════════════════════════════════════════════
-- Sign-up funnel that tells the truth, and a record of email consent
-- ════════════════════════════════════════════════════════════════════
-- 1. "signup_started" used to be sent when the sign-up PAGE opened (23 of
--    them in the first 20 hours, 19 distinct browsers, against 3 real
--    sign-ups). It now means the form was submitted. The page opening is
--    "signup_viewed". Existing rows are relabelled: the old page-view rows
--    never carry a `method`, the new submit rows always do, so this is safe
--    to run again at any time.
-- 2. New funnel events: signup_viewed, signup_step (which step of the
--    sign-up wizard), email_confirmed (the emailed link was opened),
--    onboarding_step (how far the company form got), checkout_failed
--    (Stripe checkout could not be created).
-- 3. email_consents: when and how someone was told about, or agreed to,
--    email from PMRFP (CASL), with the wording version they saw. Written by
--    the server only.
-- 4. site_analytics_report() gains `steps`: signup_step / onboarding_step
--    counts (and the company-form field that was refused), per market, for
--    /admin/analytics. Every existing key is unchanged.
-- Safe to re-run.

-- ── 1. Allow the new events; relabel the old page-view rows ───────────
alter table public.site_events drop constraint if exists site_events_event_check;
alter table public.site_events add constraint site_events_event_check check (event in (
  'signup_viewed', 'signup_step', 'signup_started', 'signup_completed',
  'email_confirmed', 'onboarding_step', 'onboarding_completed',
  'writer_started', 'writer_draft_generated', 'rfp_posted',
  'pricing_viewed', 'upgrade_clicked', 'checkout_started', 'checkout_failed', 'checkout_completed',
  'trial_started', 'follow_buyer', 'claim_started', 'claim_verified',
  'respond_to_job', 'quote_request_posted', 'sealed_opened', 'award_published'
));

update public.site_events
   set event = 'signup_viewed'
 where event = 'signup_started'
   and (props->>'method') is null;

-- ── 2. Email consent record ───────────────────────────────────────────
create table if not exists public.email_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  -- service: account, followed bids, product tips (told at sign-up).
  -- marketing: offers and news (an unticked box in onboarding that they ticked).
  scope text not null check (scope in ('service', 'marketing')),
  source text not null check (source in ('signup_form', 'onboarding', 'google_signup', 'settings', 'other')),
  -- Which wording they saw (lib/consent/email.ts). Bump it whenever the text changes.
  wording_version text not null check (char_length(wording_version) between 1 and 40),
  lang text check (lang is null or lang in ('en', 'fr', 'es')),
  created_at timestamptz not null default now(),
  unique (user_id, scope, source)
);
create index if not exists email_consents_user_idx on public.email_consents (user_id);

alter table public.email_consents enable row level security;
drop policy if exists "email consents own read" on public.email_consents;
create policy "email consents own read" on public.email_consents
  for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));
revoke all on public.email_consents from anon;
revoke insert, update, delete on public.email_consents from authenticated;

-- ── 3. Batched writer (same body as 20261021000200, with the new event names) ─────────────────────────────────────────────────
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
      'signup_viewed', 'signup_step', 'signup_started', 'signup_completed',
      'email_confirmed', 'onboarding_step', 'onboarding_completed',
      'writer_started', 'writer_draft_generated', 'rfp_posted',
      'pricing_viewed', 'upgrade_clicked', 'checkout_started', 'checkout_failed', 'checkout_completed',
      'trial_started', 'follow_buyer', 'claim_started', 'claim_verified',
      'respond_to_job', 'quote_request_posted', 'sealed_opened', 'award_published'
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


-- ── 4. Aggregated report: same as 20261021000200, plus `steps` ─────────
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
  ),
  -- Where unfinished sign-ups stopped: the sign-up wizard's steps and the
  -- onboarding form's steps (and which field was refused), per market.
  steps as (
    select case e.country when 'CA' then 'CA' when 'US' then 'US' else 'other' end as market,
      e.event,
      coalesce(left(e.props->>'step', 40), '') as step,
      coalesce(left(e.props->>'field', 40), '') as field,
      count(distinct coalesce(e.user_id::text, e.anon_hash, e.id::text))::int as actors,
      count(*)::int as n
    from public.site_events e, rng
    where e.event in ('signup_step', 'onboarding_step')
      and e.created_at >= rng.f and e.created_at < rng.t + 1
    group by 1, 2, 3, 4
  )
  select jsonb_build_object(
    'from', (select f from rng),
    'to', (select t from rng),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'market', market, 'visitors', visitors, 'page_views', page_views) order by day, market) from daily), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'path', path, 'views', views) order by market, views desc, path) from pages), '[]'::jsonb),
    'top_referrers', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'host', host, 'visits', visits) order by market, visits desc, host) from refs), '[]'::jsonb),
    'signups', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'channel', channel, 'method', method, 'role', role, 'n', n)) from signups), '[]'::jsonb),
    'accounts', (select jsonb_build_object('total', total, 'without_row', without_row) from accounts),
    'events', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'event', event, 'role_group', role_group, 'actors', actors, 'n', n)) from events), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'event', event, 'step', step, 'field', field, 'actors', actors, 'n', n)) from steps), '[]'::jsonb)
  );
$$;
revoke all on function public.site_analytics_report(date, date) from public;
revoke all on function public.site_analytics_report(date, date) from anon, authenticated;
grant execute on function public.site_analytics_report(date, date) to service_role;

-- ── Explicit Data API access ──────────────────────────────────────────
grant select, insert, update, delete on public.email_consents to service_role;
grant usage, select on sequence public.email_consents_id_seq to service_role;
grant select on public.email_consents to authenticated;
