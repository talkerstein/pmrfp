-- ════════════════════════════════════════════════════════════════════
-- Insights: the weekly personal brief's send log and the AI-validator
-- rejection log.
-- ════════════════════════════════════════════════════════════════════
-- insight_brief_log: ONE weekly brief per member per ISO week. The cron
-- (/api/cron/insights-brief, behind INSIGHTS_EMAIL_ENABLED) inserts the
-- (user_id, week) row BEFORE sending; the primary key makes a second run
-- in the same week a no-op, so a retry can't double-send. Without this
-- table the cron sends nothing (dry runs still work).
--
-- insight_rejections: every AI-polished sentence the validator threw away
-- (a number, name, month or piece of advice that wasn't in the fact), with
-- the template that was used instead. Read at /admin/insights.
--
-- Service role only (no policies). Safe to re-run.

create table if not exists public.insight_brief_log (
  user_id uuid not null references public.users_profile(id) on delete cascade,
  week text not null check (week ~ '^\d{4}-W\d{2}$'),
  organization_id uuid references public.organizations(id) on delete set null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  fact_ids text[] not null default '{}',
  lead_keys text[] not null default '{}',
  polished integer not null default 0,
  lang text not null default 'en',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  detail text,
  primary key (user_id, week)
);

create index if not exists insight_brief_log_week_idx on public.insight_brief_log(week);

alter table public.insight_brief_log enable row level security;
revoke all on public.insight_brief_log from anon, authenticated;

create table if not exists public.insight_rejections (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null default 'brief' check (source in ('brief', 'preview')),
  user_id uuid references public.users_profile(id) on delete set null,
  fact_id text not null check (char_length(fact_id) <= 300),
  kind text not null,
  lang text not null,
  reason text not null,
  template text not null,
  output text not null,
  model text
);

create index if not exists insight_rejections_created_idx on public.insight_rejections(created_at desc);

alter table public.insight_rejections enable row level security;
revoke all on public.insight_rejections from anon, authenticated;

-- Verify: expect two zero counts before the first send.
select (select count(*) from public.insight_brief_log) as briefs_logged,
       (select count(*) from public.insight_rejections) as rejections_logged;
