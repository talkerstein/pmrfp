-- ════════════════════════════════════════════════════════════════════
-- Lifecycle emails: the onboarding → trial → upgrade sequence
-- ════════════════════════════════════════════════════════════════════
--   lifecycle_sends   one row per member per step (src/lib/lifecycle):
--                     sent, skipped (the member already did the thing, or
--                     there was nothing real to show) or failed. The cron
--                     (/api/cron/lifecycle, behind LIFECYCLE_EMAILS_ENABLED)
--                     writes the row BEFORE sending, and (user_id, step) is
--                     unique, so a retry or a racing run can never send the
--                     same step twice. resend_id + opened_at / clicked_at
--                     come from Resend's own delivery webhooks (only when
--                     open / click tracking is on in Resend).
--                     Admins read; the app writes with the service role.
--   notification_preferences.lifecycle_emails
--                     false = the member used the lifecycle unsubscribe link
--                     (/api/email/lifecycle-unsubscribe). Alerts and account
--                     emails are separate and unaffected.
--
-- Safe to re-run.

create table if not exists public.lifecycle_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  step text not null check (step in (
    'welcome', 'market', 'get_found', 'trial_offer', 'benchmark', 'community', 'founding',
    'trial_day1', 'trial_day7', 'trial_day12', 'trial_expired', 'trial_winback'
  )),
  status text not null default 'sending' check (status in ('sending', 'sent', 'skipped', 'failed')),
  -- Skip reason or send error (short, no personal data).
  detail text check (detail is null or char_length(detail) <= 300),
  lang text check (lang is null or lang in ('en', 'fr', 'es')),
  resend_id text check (resend_id is null or char_length(resend_id) <= 100),
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lifecycle_sends_one_per_step unique (user_id, step)
);
create index if not exists lifecycle_sends_user_idx on public.lifecycle_sends (user_id, sent_at desc);
create index if not exists lifecycle_sends_step_idx on public.lifecycle_sends (step, status);
create index if not exists lifecycle_sends_resend_idx on public.lifecycle_sends (resend_id) where resend_id is not null;

alter table public.lifecycle_sends enable row level security;
drop policy if exists "lifecycle sends admin read" on public.lifecycle_sends;
create policy "lifecycle sends admin read" on public.lifecycle_sends
  for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.lifecycle_sends from anon;
revoke insert, update, delete on public.lifecycle_sends from authenticated;

alter table public.notification_preferences
  add column if not exists lifecycle_emails boolean not null default true;

-- Checks:
-- select step, status, count(*), count(opened_at) as opened, count(clicked_at) as clicked
--   from public.lifecycle_sends group by 1, 2 order by 1, 2;
-- select count(*) filter (where not lifecycle_emails) as unsubscribed from public.notification_preferences;
select count(*) as lifecycle_sends from public.lifecycle_sends;
