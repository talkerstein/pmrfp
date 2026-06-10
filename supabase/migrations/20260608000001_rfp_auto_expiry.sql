-- ════════════════════════════════════════════════════════════════════
-- PMRFP — RFP auto-expiry with a PM grace period
--
-- When a published RFP's deadline passes, a daily cron emails the posting PM
-- ("still active? keep it live, or it auto-expires in 7 days") and stamps
-- expiry_notice_sent_at so we never double-ask. The email carries a one-click
-- "keep it live" link (token-authed, no login) that pushes the deadline out
-- 30 days and clears the stamp. If 7 days pass with no action, the cron flips
-- status -> 'expired' and the listing drops off the public board.
--
-- (Past-deadline RFPs stay on the public board but render grayed-out as
-- "Closed" -- social proof of real activity -- until this flips them to
-- 'expired' after the 7-day grace window.)
-- ════════════════════════════════════════════════════════════════════

alter table public.rfp_posts
  add column if not exists expiry_notice_sent_at timestamptz,
  add column if not exists keep_alive_token uuid not null default gen_random_uuid();

-- Unguessable per-RFP token backs the no-login "keep it live" email link.
create unique index if not exists rfp_posts_keep_alive_token_idx
  on public.rfp_posts (keep_alive_token);

-- Speeds the daily cron sweep over expiry candidates.
create index if not exists rfp_posts_expiry_sweep_idx
  on public.rfp_posts (status, deadline);
