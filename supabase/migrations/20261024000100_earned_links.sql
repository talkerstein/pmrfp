-- ════════════════════════════════════════════════════════════════════
-- Earn the link: nofollow by default, a followed link is earned
-- ════════════════════════════════════════════════════════════════════
-- SEO agencies were signing up, getting an auto-approved profile, and taking
-- a followed backlink from it at once. From now on PMRFP's link to a member's
-- website is rel="nofollow ugc" unless the member has given something back
-- (src/lib/links/policy.ts):
--   approved + not suspended/flagged + live 14 days + (active paid plan OR our
--   badge detected on their own site)  -- or an admin marked it trusted.
--
--   organizations.link_trusted           admin override (house / sister companies
--                                        are set below, only if they exist)
--   organizations.link_paid              active Trade Pro / Featured / lifetime
--   organizations.link_badge             badge detected on the company's own site
--   organizations.link_earned_at         when the sync first saw the link earned
--                                        link_paid / link_badge / link_earned_at /
--                                        email_domain_verified / profile_indexable are
--                                        kept by the daily sync (/api/cron/link-signals)
--   organizations.risk_flagged           the spam check flagged the listing (public
--                                        flag only: the reasons live in organization_risk,
--                                        which the public cannot read)
--   organizations.email_domain_verified  the owner's sign-in email is on the company's
--                                        own website domain (not gmail & co.)
--   organizations.profile_indexable      quality bar for search engines (src/lib/links/indexing.ts)
--
--   organization_risk    score + reasons per company, admin read only
--   blocked_domains      SEO / spam domains (admin editable at /admin/blocked-domains)
--   org_link_clicks      daily "visits to your website from PMRFP" per company,
--                        written in batches by record_org_link_clicks() (service role)
--
-- Nothing is deleted or suspended here. Everyone who is not trusted becomes
-- nofollow on deploy. Safe to re-run.

-- ── 1. Columns ─────────────────────────────────────────────────────────
alter table public.organizations add column if not exists link_trusted boolean not null default false;
alter table public.organizations add column if not exists link_paid boolean not null default false;
alter table public.organizations add column if not exists link_badge boolean not null default false;
alter table public.organizations add column if not exists link_earned_at timestamptz;
alter table public.organizations add column if not exists risk_flagged boolean not null default false;
alter table public.organizations add column if not exists email_domain_verified boolean not null default false;
alter table public.organizations add column if not exists profile_indexable boolean not null default true;

create index if not exists organizations_risk_flagged_idx on public.organizations(risk_flagged) where risk_flagged;
create index if not exists organizations_not_indexable_idx on public.organizations(slug) where not profile_indexable;

-- Members can never set these for themselves (same idea as guard_organization_privileged).
create or replace function public.guard_organization_link_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_edit boolean := auth.uid() is not null and not public.is_admin(auth.uid());
begin
  if tg_op = 'INSERT' then
    if member_edit then
      new.link_trusted := false;
      new.link_paid := false;
      new.link_badge := false;
      new.link_earned_at := null;
      new.risk_flagged := false;
      new.email_domain_verified := false;
      new.profile_indexable := true;
    end if;
    return new;
  end if;
  if member_edit and (
    new.link_trusted is distinct from old.link_trusted
    or new.link_paid is distinct from old.link_paid
    or new.link_badge is distinct from old.link_badge
    or new.link_earned_at is distinct from old.link_earned_at
    or new.risk_flagged is distinct from old.risk_flagged
    or new.email_domain_verified is distinct from old.email_domain_verified
    or new.profile_indexable is distinct from old.profile_indexable
  ) then
    raise exception 'Only an administrator can change link and spam-check fields';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_link_fields on public.organizations;
create trigger organizations_guard_link_fields
  before insert or update on public.organizations
  for each row execute function public.guard_organization_link_fields();

-- ── 2. Blocked domains ─────────────────────────────────────────────────
create table if not exists public.blocked_domains (
  domain text primary key check (char_length(domain) between 3 and 253 and domain = lower(domain) and domain !~ '[\s/@]'),
  reason text check (reason is null or char_length(reason) <= 300),
  created_by uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blocked_domains enable row level security;
drop policy if exists "blocked domains admin read" on public.blocked_domains;
create policy "blocked domains admin read" on public.blocked_domains
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.blocked_domains from anon;
revoke insert, update, delete on public.blocked_domains from authenticated;
grant select, insert, update, delete on public.blocked_domains to service_role;
grant select on public.blocked_domains to authenticated;

insert into public.blocked_domains (domain, reason) values
  ('bearseoservice.com', 'SEO agency that created satellite listings (2026-10-24)'),
  ('marlinleads.com', 'Lead-gen / SEO backlink listing (2026-10-24)')
on conflict (domain) do nothing;

-- ── 3. Spam-check result per company (admin only) ──────────────────────
create table if not exists public.organization_risk (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  -- held: waiting for an admin (a new listing in pending_review, or an approved one whose edit scored high).
  held boolean not null default false,
  blocked boolean not null default false,
  source text not null default 'onboarding' check (source in ('onboarding', 'profile_edit', 'backfill')),
  decision text check (decision is null or decision in ('approved', 'rejected', 'suspended')),
  decided_by uuid references public.users_profile(id) on delete set null,
  decided_at timestamptz,
  evaluated_at timestamptz not null default now()
);
create index if not exists organization_risk_held_idx on public.organization_risk(evaluated_at desc) where held;
alter table public.organization_risk enable row level security;
drop policy if exists "organization risk admin read" on public.organization_risk;
create policy "organization risk admin read" on public.organization_risk
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.organization_risk from anon;
revoke insert, update, delete on public.organization_risk from authenticated;
grant select, insert, update, delete on public.organization_risk to service_role;
grant select on public.organization_risk to authenticated;

-- ── 4. Click-outs: "N visits to your website from PMRFP" ───────────────
create table if not exists public.org_link_clicks (
  org_id uuid not null references public.organizations(id) on delete cascade,
  day date not null,
  clicks integer not null default 0 check (clicks >= 0),
  primary key (org_id, day)
);
alter table public.org_link_clicks enable row level security;
drop policy if exists "org link clicks admin read" on public.org_link_clicks;
create policy "org link clicks admin read" on public.org_link_clicks
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.org_link_clicks from anon;
revoke insert, update, delete on public.org_link_clicks from authenticated;
grant select, insert, update, delete on public.org_link_clicks to service_role;
grant select on public.org_link_clicks to authenticated;

-- [{"slug":"acme-paving","day":"2026-10-24","n":3}, …] → one upsert per company and day.
create or replace function public.record_org_link_clicks(p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.org_link_clicks as c (org_id, day, clicks)
  select o.id, x.day, sum(x.n)::int
  from (
    select
      left(r->>'slug', 160) as slug,
      coalesce((r->>'day')::date, (now() at time zone 'America/Toronto')::date) as day,
      greatest(0, least(100000, coalesce((r->>'n')::int, 0))) as n
    from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as r
    where coalesce(r->>'slug', '') <> ''
  ) x
  join public.organizations o on o.slug = x.slug
  group by o.id, x.day
  on conflict (org_id, day)
  do update set clicks = c.clicks + excluded.clicks;
$$;
revoke all on function public.record_org_link_clicks(jsonb) from public;
revoke all on function public.record_org_link_clicks(jsonb) from anon, authenticated;
grant execute on function public.record_org_link_clicks(jsonb) to service_role;

-- ── 5. House / sister companies: trusted (only the ones that exist) ────
-- Matched by slug or by website host. Nothing fails when none exist.
update public.organizations
   set link_trusted = true
 where not link_trusted
   and (
     slug in ('talkerstein-consulting', 'maple-electric-supply', 'cleverpays', 'permitclub')
     or lower(coalesce(website, '')) ~ '^(https?://)?(www\.)?(talkerstein\.(com|ca)|mapleelectricsupply\.ca|cleverpays\.ca|permitclub\.com)(/|$)'
   );

-- ── Verify ────────────────────────────────────────────────────────────
-- select name, slug, website from public.organizations where link_trusted;
-- select * from public.blocked_domains;
-- select count(*) from public.organizations where link_trusted;
