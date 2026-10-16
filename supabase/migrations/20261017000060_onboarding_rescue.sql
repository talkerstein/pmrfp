-- ════════════════════════════════════════════════════════════════════
-- Onboarding rescue + where sign-ups stall
-- ════════════════════════════════════════════════════════════════════
--   lifecycle_sends.step   four new steps (src/lib/lifecycle):
--                          rescue_2h / rescue_1d / rescue_3d for trade
--                          accounts that never finished onboarding (no
--                          company yet), and review_pending, sent once to a
--                          new company whose profile waits in
--                          pending_review. Same table, same unique
--                          (user_id, step): never twice. organization_id is
--                          null on rescue rows (there's no company yet).
--   onboarding_steps       one row per user per onboarding step the app
--                          saw (lib/onboarding/progress): role_pick_viewed,
--                          role_picked, form_viewed, form_error,
--                          org_failed. first_at = first time, last_at =
--                          latest, detail = the first failing form field or
--                          an error code (never what they typed). The
--                          furthest step = where they stalled
--                          (/admin/lifecycle "Stalled sign-ups").
--                          Admins read; the app writes with the service role.
--
-- Requires 20261016000020_lifecycle_emails.sql. Safe to re-run.

alter table public.lifecycle_sends drop constraint if exists lifecycle_sends_step_check;
alter table public.lifecycle_sends add constraint lifecycle_sends_step_check check (step in (
  'rescue_2h', 'rescue_1d', 'rescue_3d', 'review_pending',
  'welcome', 'market', 'get_found', 'trial_offer', 'benchmark', 'community', 'founding',
  'trial_day1', 'trial_day7', 'trial_day12', 'trial_expired', 'trial_winback'
));

create table if not exists public.onboarding_steps (
  user_id uuid not null references public.users_profile(id) on delete cascade,
  step text not null check (step in ('role_pick_viewed', 'role_picked', 'form_viewed', 'form_error', 'org_failed')),
  detail text check (detail is null or char_length(detail) <= 80),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, step)
);
create index if not exists onboarding_steps_step_idx on public.onboarding_steps (step, first_at desc);

alter table public.onboarding_steps enable row level security;
drop policy if exists "onboarding steps admin read" on public.onboarding_steps;
create policy "onboarding steps admin read" on public.onboarding_steps
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.onboarding_steps from anon;
revoke insert, update, delete on public.onboarding_steps from authenticated;

-- Checks:
-- Where unfinished sign-ups stopped (furthest step per user):
-- select step, count(*) from (
--   select distinct on (s.user_id) s.user_id, s.step
--     from public.onboarding_steps s join public.users_profile p on p.id = s.user_id
--    where not p.onboarding_completed
--    order by s.user_id, array_position(array['role_pick_viewed','role_picked','form_viewed','form_error','org_failed'], s.step) desc
-- ) x group by step order by 2 desc;
-- select step, status, count(*) from public.lifecycle_sends where step like 'rescue%' or step = 'review_pending' group by 1, 2;
select count(*) as onboarding_steps from public.onboarding_steps;
