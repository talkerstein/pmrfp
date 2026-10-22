-- ════════════════════════════════════════════════════════════════════
-- Badge lifecycle: the badge emails and the one-time install reward
-- ════════════════════════════════════════════════════════════════════
--   lifecycle_sends.step   four new steps (src/lib/lifecycle):
--                          badge            right after the profile is approved
--                          badge_reminder   7 days later, only if no install was seen
--                          badge_thanks     once, when the install is first detected
--                          welcome_back     the one catch-up email at go-live
--                          Same table, same unique (user_id, step): never twice.
--   badge_rewards          one row per company that earned the badge reward (a
--                          one-time +14 days of Trade Pro, behind the env flag
--                          BADGE_REWARD_ENABLED, off by default). organization_id
--                          is the primary key, so a racing second run, or a
--                          second detection, can never grant it twice. The row
--                          also keeps the trade_trials dates from before the
--                          change, so nothing about the old trial is lost:
--                            kind 'start'   the company had no trial; a new 14-day
--                                           trade_trials row was added (source 'badge')
--                            kind 'extend'  a trial was running; ends_at moved 14 days
--                            kind 'reopen'  the trial had ended; the same row runs
--                                           14 days from the grant
--                          The reward is never written by a member or an admin
--                          screen: only the cron (service role) writes it, from
--                          the badge_hits counters. Admins read.
--
-- Requires 20261016000020_lifecycle_emails.sql, 20261017000060_onboarding_rescue.sql
-- and 20261016000001_trade_trials.sql. Safe to re-run.

alter table public.lifecycle_sends drop constraint if exists lifecycle_sends_step_check;
alter table public.lifecycle_sends add constraint lifecycle_sends_step_check check (step in (
  'rescue_2h', 'rescue_1d', 'rescue_3d', 'review_pending',
  'welcome', 'market', 'get_found', 'trial_offer', 'benchmark', 'community', 'founding',
  'trial_day1', 'trial_day7', 'trial_day12', 'trial_expired', 'trial_winback',
  'badge', 'badge_reminder', 'badge_thanks', 'welcome_back'
));

create table if not exists public.badge_rewards (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  granted_at timestamptz not null default now(),
  kind text not null check (kind in ('start', 'extend', 'reopen')),
  days integer not null check (days between 1 and 31),
  -- The company's own site the badge was seen on, and how many different days.
  domain text not null check (char_length(domain) between 3 and 253),
  distinct_days integer not null check (distinct_days >= 2),
  detected_on date,
  trial_started_before timestamptz,
  trial_ends_before timestamptz,
  trial_started_after timestamptz not null,
  trial_ends_after timestamptz not null
);

alter table public.badge_rewards enable row level security;
drop policy if exists "badge rewards admin read" on public.badge_rewards;
create policy "badge rewards admin read" on public.badge_rewards
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.badge_rewards from anon;
revoke insert, update, delete on public.badge_rewards from authenticated;

-- Checks:
-- select step, status, count(*) from public.lifecycle_sends where step in ('badge','badge_reminder','badge_thanks','welcome_back') group by 1, 2;
-- select r.kind, o.name, r.domain, r.distinct_days, r.trial_ends_after from public.badge_rewards r join public.organizations o on o.id = r.organization_id order by r.granted_at desc;
select count(*) as badge_rewards from public.badge_rewards;

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.badge_rewards to service_role;
grant select on public.badge_rewards to authenticated;
