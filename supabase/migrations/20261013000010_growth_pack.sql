-- ════════════════════════════════════════════════════════════════════
-- Growth pack: badge installs, contract-winner claims, free weekly digest
-- ════════════════════════════════════════════════════════════════════
--   badge_hits              daily counters of badge image loads by the
--                           embedding site's domain. Written in batches by
--                           record_badge_hits() (service role only). Admin read.
--   winner_claims           "Is this your company?" claims on
--                           /contract-winners/<slug>. Admins and the claimant
--                           read; the app writes with the service role after it
--                           checked the session. A claim links the page to the
--                           claimant's organization; the public award facts are
--                           never editable.
--   winner_claims_public    view, anon + authenticated: approved claims with the
--                           organization's public profile fields only.
--   digest_subscribers      free weekly email (double opt-in). Admins read;
--                           the app writes with the service role.
--   email_suppressions      hard bounces, complaints and manual blocks. Every
--                           marketing send skips these addresses.
--
-- Safe to re-run.

-- ── Badge installs ──
create table if not exists public.badge_hits (
  day date not null,
  kind text not null check (kind in ('listed', 'winner', 'karma')),
  slug text not null check (char_length(slug) between 1 and 120),
  referrer text not null default '' check (char_length(referrer) <= 120),
  hits integer not null default 0 check (hits >= 0),
  primary key (day, kind, slug, referrer)
);
create index if not exists badge_hits_referrer_idx on public.badge_hits (referrer, day desc);

alter table public.badge_hits enable row level security;
drop policy if exists "badge hits admin read" on public.badge_hits;
create policy "badge hits admin read" on public.badge_hits
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.badge_hits from anon;

-- [{"day":"2026-10-13","kind":"winner","slug":"acme-paving","referrer":"acmepaving.ca","n":4}, …]
create or replace function public.record_badge_hits(p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.badge_hits as b (day, kind, slug, referrer, hits)
  select day, kind, slug, referrer, sum(n)::int
  from (
    select
      coalesce((r->>'day')::date, (now() at time zone 'America/Toronto')::date) as day,
      r->>'kind' as kind,
      left(r->>'slug', 120) as slug,
      left(lower(coalesce(r->>'referrer', '')), 120) as referrer,
      greatest(0, least(100000, coalesce((r->>'n')::int, 0))) as n
    from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as r
    where r->>'kind' in ('listed', 'winner', 'karma') and coalesce(r->>'slug', '') <> ''
  ) x
  group by day, kind, slug, referrer
  on conflict (day, kind, slug, referrer)
  do update set hits = b.hits + excluded.hits;
$$;
revoke all on function public.record_badge_hits(jsonb) from public;
revoke all on function public.record_badge_hits(jsonb) from anon, authenticated;
grant execute on function public.record_badge_hits(jsonb) to service_role;

-- ── Contract-winner claims ──
create table if not exists public.winner_claims (
  id uuid primary key default gen_random_uuid(),
  winner_slug text not null check (char_length(winner_slug) between 1 and 120),
  winner_name text not null check (char_length(winner_name) between 1 and 300),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  website text check (website is null or char_length(website) <= 300),
  -- email_domain: the claimant's email domain matched the company website and the
  -- website matched the winner's name, so it went live at once. admin_review: everything else.
  method text not null check (method in ('email_domain', 'admin_review')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  note text check (note is null or char_length(note) <= 1000),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  reviewed_by uuid references public.users_profile(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- One live claim per winner page, one open claim per person per page.
create unique index if not exists winner_claims_one_approved on public.winner_claims (winner_slug) where status = 'approved';
create unique index if not exists winner_claims_one_open on public.winner_claims (winner_slug, user_id) where status in ('pending', 'approved');
create index if not exists winner_claims_status_idx on public.winner_claims (status, created_at desc);

alter table public.winner_claims enable row level security;
drop policy if exists "winner claims own or admin read" on public.winner_claims;
create policy "winner claims own or admin read" on public.winner_claims
  for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));
revoke all on public.winner_claims from anon;

-- Public: approved claims and the organization's public profile only.
create or replace view public.winner_claims_public as
  select
    c.winner_slug,
    o.name,
    o.slug as org_slug,
    o.logo_url,
    o.short_description,
    o.website,
    case when o.public_contact_visibility = 'show_contact' then o.phone end as phone,
    case when o.public_contact_visibility = 'show_contact' then o.email end as email,
    o.city,
    o.province,
    o.verified,
    c.reviewed_at as claimed_at
  from public.winner_claims c
  join public.organizations o on o.id = c.organization_id
  where c.status = 'approved'
    and o.profile_status = 'approved' and o.status = 'active' and not o.is_demo;
revoke all on public.winner_claims_public from public;
grant select on public.winner_claims_public to anon, authenticated;

-- ── Weekly digest subscribers ──
create table if not exists public.digest_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254),
  -- lower(email), so one address is one subscriber.
  email_key text generated always as (lower(email)) stored,
  country text not null check (country in ('CA', 'US')),
  province text not null check (char_length(province) between 2 and 60),
  trades text[] not null default '{}' check (cardinality(trades) <= 10),
  lang text not null default 'en' check (lang in ('en', 'fr', 'es')),
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed', 'bounced')),
  -- sha256 of the confirmation token (the token itself is only in the email).
  confirm_token_hash text,
  confirm_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  -- CASL record of consent: where, when and the wording version.
  source text not null default 'site' check (char_length(source) <= 40),
  consent_text_version text not null default 'v1',
  consent_at timestamptz not null default now(),
  -- Linked when the same address has (or later gets) a PMRFP account.
  user_id uuid references public.users_profile(id) on delete set null,
  -- 0-3: which quarter-hour of the weekly send this subscriber is in (staggered cron).
  send_bucket smallint not null default floor(random() * 4)::smallint check (send_bucket between 0 and 3),
  last_sent_at timestamptz,
  sends integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists digest_subscribers_email_key on public.digest_subscribers (email_key);
create index if not exists digest_subscribers_send_idx on public.digest_subscribers (status, send_bucket, last_sent_at);

alter table public.digest_subscribers enable row level security;
drop policy if exists "digest subscribers admin read" on public.digest_subscribers;
create policy "digest subscribers admin read" on public.digest_subscribers
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.digest_subscribers from anon;

-- ── Suppression list (bounces, complaints, manual) ──
create table if not exists public.email_suppressions (
  email_key text primary key check (char_length(email_key) between 3 and 254),
  reason text not null check (reason in ('bounce', 'complaint', 'manual', 'unsubscribe')),
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
drop policy if exists "email suppressions admin read" on public.email_suppressions;
create policy "email suppressions admin read" on public.email_suppressions
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.email_suppressions from anon;

-- Checks:
-- select kind, referrer, sum(hits) from public.badge_hits group by 1, 2 order by 3 desc;
-- select status, count(*) from public.winner_claims group by 1;
-- select status, country, count(*) from public.digest_subscribers group by 1, 2;
