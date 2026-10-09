-- ════════════════════════════════════════════════════════════════════
-- Company reputation ("karma"): one ledger, one score per company.
-- ════════════════════════════════════════════════════════════════════
-- Rules live in code (src/lib/karma/rules.ts, derive.ts) so they are unit
-- tested. The server derives events from REAL data (forum votes from other
-- companies, verified client reviews, RFPs that drew bids, admin approval)
-- and writes them here with the service role. This replaces the forum's
-- per-member reputation: forum_reputation_events is no longer written to
-- (kept, untouched, for history).
--
--  karma_events      the ledger. Never deleted by the app: a clawback sets
--                    reversed_at + reversed_reason, so the audit trail stays.
--  org_karma         the derived score + level per company (nightly cron
--                    and after every sync).
--  org_karma_public  level ONLY, for listed companies. What the public sees.
--  karma_ledger      a company's own ledger for its members, without the
--                    actor column (who voted stays private).
--  gc_package_levels the poster's level on published GC packages, without
--                    revealing who posted them.
--
-- Writes: service role only (no insert/update/delete policies).
-- Safe to re-run.

create table if not exists public.karma_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The member whose work earned it (null for company-level events).
  user_id uuid references public.users_profile(id) on delete set null,
  kind text not null check (kind in (
    'profile_approved', 'vendor_verified',
    'forum_accepted_answer', 'forum_answer_upvote', 'forum_thread_rated', 'forum_content_removed',
    'project_verified_review', 'gc_package_interest', 'gc_award_package', 'rfp_bids_received',
    'referral_verified', 'admin_adjustment'
  )),
  points integer not null check (points between -1000 and 1000),
  source_type text not null,
  source_id text not null,
  -- Voter / rater / asker (pair caps). Admin-only: not in karma_ledger.
  actor_id text not null default '',
  reason text check (char_length(reason) <= 500),
  -- When the underlying action happened (drives caps and decay).
  created_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  created_by uuid references public.users_profile(id) on delete set null,
  reversed_at timestamptz,
  -- 'sync: …' = the source went away (auto, can come back);
  -- 'admin: …' = an admin marked abuse (sticks).
  reversed_reason text check (char_length(reversed_reason) <= 500),
  reversed_by uuid references public.users_profile(id) on delete set null,
  unique (org_id, kind, source_type, source_id, actor_id),
  constraint karma_admin_reason check (kind <> 'admin_adjustment' or char_length(coalesce(reason, '')) >= 3)
);
create index if not exists karma_events_org_idx on public.karma_events(org_id, created_at desc);
create index if not exists karma_events_kind_idx on public.karma_events(kind);

create table if not exists public.org_karma (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  raw_points integer not null default 0,
  score integer not null default 0,
  level smallint not null default 1 check (level between 1 and 5),
  decay numeric(4,2) not null default 1,
  last_earned_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists org_karma_level_idx on public.org_karma(level);

alter table public.karma_events enable row level security;
alter table public.org_karma enable row level security;

-- The raw ledger (with actor ids) is admin-only. Members use karma_ledger.
drop policy if exists "karma events admin read" on public.karma_events;
create policy "karma events admin read" on public.karma_events
  for select using (public.is_admin(auth.uid()));

-- The number is private to the company (and admins).
drop policy if exists "org karma member read" on public.org_karma;
create policy "org karma member read" on public.org_karma
  for select using (public.is_org_member(auth.uid(), org_id) or public.is_admin(auth.uid()));

-- Public: level only, listed companies only.
create or replace view public.org_karma_public as
  select k.org_id, k.level
  from public.org_karma k
  join public.organizations o on o.id = k.org_id
  where o.profile_status = 'approved' and o.status = 'active' and not o.is_demo;
revoke all on public.org_karma_public from public;
grant select on public.org_karma_public to anon, authenticated;

-- A company's own ledger ("how you earned it"), minus the actor column.
create or replace view public.karma_ledger as
  select e.id, e.org_id, e.kind, e.points, e.source_type, e.source_id, e.reason,
         e.created_at, e.reversed_at, e.reversed_reason
  from public.karma_events e
  where public.is_org_member(auth.uid(), e.org_id) or public.is_admin(auth.uid());
revoke all on public.karma_ledger from public, anon;
grant select on public.karma_ledger to authenticated;

-- Level of the company behind each published GC package (level 2+ only).
-- Says nothing about who posted it.
create or replace view public.gc_package_levels as
  select r.slug, k.level
  from public.rfp_posts r
  join public.org_karma_public k on k.org_id = r.posted_by_organization_id
  where r.status = 'published' and r.source_type = 'gc_package' and k.level >= 2;
revoke all on public.gc_package_levels from public;
grant select on public.gc_package_levels to anon, authenticated;

-- ── Verify ────────────────────────────────────────────────────────────
-- select count(*) from public.karma_events;          -- 0 until the backfill runs
-- select level, count(*) from public.org_karma group by 1 order by 1;
