-- "Can my company bid?" checklists, extracted from each tender's notice text
-- by /api/cron/bid-checks (Gemini). One row per RFP; result is null when
-- extraction failed (error says why), so a bad notice isn't retried forever.
--
-- Read by the RFP page on the server (service role). The select policy below
-- mirrors rfp_posts' full-read rule so a client-side read by a paying member
-- or an admin would also work; anonymous users get nothing.
-- Idempotent.

create table if not exists public.rfp_bid_checks (
  rfp_id uuid primary key references public.rfp_posts(id) on delete cascade,
  result jsonb,
  model text,
  error text,
  created_at timestamptz not null default now()
);

alter table public.rfp_bid_checks enable row level security;

drop policy if exists "bid checks: members and admins read" on public.rfp_bid_checks;
create policy "bid checks: members and admins read" on public.rfp_bid_checks
  for select using (public.has_active_trade_access(auth.uid()) or public.is_admin(auth.uid()));

-- Verify: expect 0 on first run.
select count(*) as bid_checks from public.rfp_bid_checks;
