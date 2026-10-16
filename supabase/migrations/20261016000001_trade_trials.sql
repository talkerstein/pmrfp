-- ════════════════════════════════════════════════════════════════════
-- 14-day Trade Pro trial: no card, one per organization.
-- ════════════════════════════════════════════════════════════════════
-- A trade company starts it with one click (dashboard, pricing, lead
-- teaser). While ends_at is in the future the organization counts as
-- Trade Pro everywhere: has_active_trade_access() below (RLS on rfp_posts,
-- major_projects, rfp_bid_checks, …) and its TypeScript mirror
-- computeTradeAccess() in src/lib/access/access.ts. When it ends the
-- organization is simply free again; nothing in Stripe or subscriptions
-- changes, so paying later is the normal checkout.
--
-- One trial per organization, ever: organization_id is the primary key,
-- so a second insert fails even if two clicks race. Rows are never deleted
-- by the app (the row IS the "already had a trial" record).
--
-- Writes: service role only (src/lib/entitlement/server.ts checks the
-- member, the company type and that it isn't already paying first).
-- Reads: the organization's own members and admins.
-- Safe to re-run.

create table if not exists public.trade_trials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  started_by uuid references public.users_profile(id) on delete set null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  -- Where the click came from: 'dashboard', 'pricing', 'leads', 'admin'.
  source text not null default 'dashboard' check (source ~ '^[a-z0-9_-]{2,30}$'),
  created_at timestamptz not null default now(),
  constraint trade_trials_window check (ends_at > started_at and ends_at <= started_at + interval '31 days')
);

create index if not exists trade_trials_ends_idx on public.trade_trials(ends_at);

alter table public.trade_trials enable row level security;

drop policy if exists "trade trials member read" on public.trade_trials;
create policy "trade trials member read" on public.trade_trials
  for select to authenticated using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = trade_trials.organization_id and om.user_id = auth.uid()
    )
    or public.is_admin(auth.uid())
  );

revoke all on public.trade_trials from anon;
revoke insert, update, delete on public.trade_trials from authenticated;
grant select on public.trade_trials to authenticated;

-- Trade Pro access = an active/comped Pro or Featured subscription (as
-- before, 20260819000001) OR a trade-company trial that hasn't ended.
-- Keep in lockstep with computeTradeAccess() in src/lib/access/access.ts.
create or replace function public.has_active_trade_access(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    join public.subscriptions s on s.organization_id = o.id
    where om.user_id = uid
      and o.organization_type in ('trade_company','supplier')
      and o.status <> 'suspended'
      and s.status in ('active','comped')
      and s.tier in ('pro','featured')
  )
  or exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    join public.trade_trials t on t.organization_id = o.id
    where om.user_id = uid
      and o.organization_type = 'trade_company'
      and o.status <> 'suspended'
      and t.ends_at > now()
  );
$$;

-- Verify: expect 0 trials right after the first run.
select count(*) as trade_trials from public.trade_trials;
