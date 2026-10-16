-- ════════════════════════════════════════════════════════════════════
-- Lead alerts: which lead each member has already been emailed.
-- ════════════════════════════════════════════════════════════════════
-- /api/cron/lead-alerts (behind LEAD_ALERTS_ENABLED) emails Trade Pro and
-- trial members "New leads for {trade} in {area}": major projects, permits,
-- development applications and contractors who just won public work in
-- their trades and area. A lead is sent to a member ONCE: the cron skips
-- every (user_id, lead_key) already here and records what it sends before
-- sending, so a retry can't double-send. Without this table the cron sends
-- nothing (dry runs still work).
--
-- lead_key: 'mp:<major_projects.id>' or 'rfp:<rfp slug>'.
-- Service role only (no policies). Safe to re-run.

create table if not exists public.lead_alert_log (
  user_id uuid not null references public.users_profile(id) on delete cascade,
  lead_key text not null check (char_length(lead_key) between 3 and 200),
  sent_at timestamptz not null default now(),
  primary key (user_id, lead_key)
);

create index if not exists lead_alert_log_sent_idx on public.lead_alert_log(sent_at);

alter table public.lead_alert_log enable row level security;
revoke all on public.lead_alert_log from anon, authenticated;

-- Verify: expect 0 rows before the first send.
select count(*) as lead_alerts_logged from public.lead_alert_log;
