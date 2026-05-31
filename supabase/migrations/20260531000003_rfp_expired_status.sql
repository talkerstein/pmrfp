-- ════════════════════════════════════════════════════════════════════
-- PMRFP — Add 'expired' RFP status
--
-- A PM can mark a listing 'expired' when it's no longer relevant (deadline
-- passed, project cancelled, scope changed) without it reading as "closed"
-- (we found a vendor) or "awarded" (we picked one). Expired = "this is no
-- longer a live opportunity, ignore it."
--
-- Expired RFPs drop off the public board (which filters status='published')
-- exactly like closed/awarded, but the distinct status lets us:
--   - show an honest "Expired" badge instead of "Closed"
--   - power a future auto-expire cron (published + deadline < now → expired)
--   - keep closed/awarded reserved for genuine outcomes (good for stats)
-- ════════════════════════════════════════════════════════════════════

alter table public.rfp_posts drop constraint rfp_posts_status_check;
alter table public.rfp_posts add constraint rfp_posts_status_check
  check (status in ('draft','pending_review','published','closed','awarded','expired','archived','rejected'));
