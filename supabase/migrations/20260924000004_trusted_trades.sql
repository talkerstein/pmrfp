-- ════════════════════════════════════════════════════════════════════
-- Trusted trades: a realtor's (or property manager's) shareable page
-- ════════════════════════════════════════════════════════════════════
-- A buyer saves trades from the directory into one list and shares a public
-- page, /trusted/<handle>, with clients. A free list holds 5 trades; Realtor
-- Pro (subscriptions.tier = 'realtor') is unlimited and shows the owner's
-- contact button. Writes go through the server (service role) only, which
-- checks the role and the limit, so there are no insert/update policies.
--
-- Safe to re-run. The app ships before this runs: every read catches the
-- missing-table error and hides the feature until it's applied.

create table if not exists public.trusted_lists (
  owner_id uuid primary key references public.users_profile(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  handle text unique not null check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  brokerage text check (char_length(brokerage) <= 80),
  headline text check (char_length(headline) <= 160),
  contact_phone text check (char_length(contact_phone) <= 30),
  contact_email text check (char_length(contact_email) <= 120),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trusted_lists_set_updated on public.trusted_lists;
create trigger trusted_lists_set_updated before update on public.trusted_lists
  for each row execute function public.set_updated_at();

create table if not exists public.trusted_list_items (
  owner_id uuid not null references public.trusted_lists(owner_id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  note text check (char_length(note) <= 280),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (owner_id, organization_id)
);
create index if not exists trusted_list_items_org_idx on public.trusted_list_items(organization_id);

alter table public.trusted_lists enable row level security;
alter table public.trusted_list_items enable row level security;

-- Anyone can read a published list (it's a public page); owners and admins
-- can also read an unpublished one.
drop policy if exists "trusted lists read" on public.trusted_lists;
create policy "trusted lists read" on public.trusted_lists
  for select using (published or owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "trusted list items read" on public.trusted_list_items;
create policy "trusted list items read" on public.trusted_list_items
  for select using (
    exists (
      select 1 from public.trusted_lists l
      where l.owner_id = trusted_list_items.owner_id
        and (l.published or l.owner_id = auth.uid())
    )
    or public.is_admin(auth.uid())
  );

-- ── Realtor Pro tier ────────────────────────────────────────────────
-- 'realtor' never grants RFP access: has_active_trade_access() only counts
-- pro/featured tiers on trade and supplier organizations.
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions
  add constraint subscriptions_tier_check check (tier in ('seo', 'pro', 'featured', 'realtor'));
