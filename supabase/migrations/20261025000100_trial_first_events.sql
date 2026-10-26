-- ════════════════════════════════════════════════════════════════════
-- Trial-first conversion: three new first-party funnel events
-- ════════════════════════════════════════════════════════════════════
--   trial_cta_clicked              someone pressed a "Start 14-day free trial"
--                                  button or link (props.source = where)
--   trial_banner_upgrade_clicked   "Upgrade" in the trial countdown banner
--   missed_bids_card_viewed        the free member's "Bids you missed" card
--                                  was shown (only when it had a real count)
-- (trial_started already exists; /admin/analytics reads all four.)
--
-- 1. site_events accepts them. 2. record_site_beacon() (the batched writer,
-- same body as 20261022000100) lets them through. Nothing else changes.
-- If another migration also redefines record_site_beacon(), keep both event
-- lists in the final version. Safe to re-run.

alter table public.site_events drop constraint if exists site_events_event_check;
alter table public.site_events add constraint site_events_event_check check (event in (
  'signup_viewed', 'signup_step', 'signup_started', 'signup_completed',
  'email_confirmed', 'onboarding_step', 'onboarding_completed',
  'writer_started', 'writer_draft_generated', 'rfp_posted',
  'pricing_viewed', 'upgrade_clicked', 'checkout_started', 'checkout_failed', 'checkout_completed',
  'trial_started', 'follow_buyer', 'claim_started', 'claim_verified',
  'respond_to_job', 'quote_request_posted', 'sealed_opened', 'award_published',
  'trial_cta_clicked', 'trial_banner_upgrade_clicked', 'missed_bids_card_viewed'
));

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
      'respond_to_job', 'quote_request_posted', 'sealed_opened', 'award_published',
      'trial_cta_clicked', 'trial_banner_upgrade_clicked', 'missed_bids_card_viewed'
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
