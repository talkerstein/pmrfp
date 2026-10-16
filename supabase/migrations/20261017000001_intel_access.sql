-- ════════════════════════════════════════════════════════════════════
-- Award Intelligence: the "intel" entitlement (a paid add-on of its own).
-- ════════════════════════════════════════════════════════════════════
-- One row per organization. Separate from subscriptions (Trade Pro): Intel
-- does not unlock Trade Pro and Trade Pro does not unlock Intel.
--
-- Written two ways, both with the service role only:
--  - Stripe: /api/stripe/webhook routes subscriptions whose metadata
--    product = 'pmrfp_award_intel' here (src/lib/intel/stripe.ts).
--  - Admin grant: /admin/intel sets status 'comped' (optionally with an
--    end date in expires_at) or revokes it ('canceled').
--
-- Entitled = status in (active, comped, trialing), expires_at empty or in
-- the future, organization not suspended. TypeScript mirror:
-- intelEntitled() in src/lib/entitlement/intel.ts (read by
-- loadSessionContext in src/lib/access/access.ts). Admins always have it.
--
-- Reads: the organization's own members and admins. Safe to re-run.

create table if not exists public.intel_access (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null default 'inactive'
    check (status in ('active','comped','trialing','past_due','canceled','unpaid','inactive')),
  source text not null default 'stripe' check (source in ('stripe','admin')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  billing_interval text check (billing_interval in ('monthly','annual')),
  currency text check (currency in ('CAD','USD')),
  amount numeric(10,2),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Admin grants only: access ends at this time (null = until revoked).
  expires_at timestamptz,
  granted_by uuid references public.users_profile(id) on delete set null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intel_access_status_idx on public.intel_access(status);

alter table public.intel_access enable row level security;

drop policy if exists "intel access member read" on public.intel_access;
create policy "intel access member read" on public.intel_access
  for select to authenticated using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = intel_access.organization_id and om.user_id = auth.uid()
    )
    or public.is_admin(auth.uid())
  );

revoke all on public.intel_access from anon;
revoke insert, update, delete on public.intel_access from authenticated;
grant select on public.intel_access to authenticated;

-- SQL mirror of intelEntitled() for crons, reports or future RLS.
create or replace function public.has_intel_access(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin(uid) or exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    join public.intel_access i on i.organization_id = o.id
    where om.user_id = uid
      and o.status <> 'suspended'
      and i.status in ('active','comped','trialing')
      and (i.expires_at is null or i.expires_at > now())
  );
$$;

-- Verify: expect 0 rows right after the first run.
select count(*) as intel_access_rows from public.intel_access;
