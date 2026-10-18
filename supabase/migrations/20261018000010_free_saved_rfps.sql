-- ════════════════════════════════════════════════════════════════════
-- Saving an RFP is free with an account
-- ════════════════════════════════════════════════════════════════════
--   saved_rfps   insert was "paid trades only" (has_active_trade_access).
--                Saving is now a free action for any signed-in account;
--                the app (api/save-rfp, lib/access/free-actions) decides who
--                may save (trade and supplier accounts, or trade access).
--                Each user still saves only for themselves; reads and
--                deletes are unchanged (own rows / admin).
--   Nothing else changes: full RFP rows (rfp_posts) stay paid-only.
-- Safe to re-run.

drop policy if exists "saved insert paid" on public.saved_rfps;
drop policy if exists "saved insert own" on public.saved_rfps;
create policy "saved insert own" on public.saved_rfps
  for insert to authenticated with check (user_id = auth.uid());

-- Verify: expect one row, "saved insert own".
select policyname from pg_policies
where schemaname = 'public' and tablename = 'saved_rfps' and cmd = 'INSERT';
