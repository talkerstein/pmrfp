-- ════════════════════════════════════════════════════════════════════
-- Bid Comparison Sheet (free PM tool)
-- ════════════════════════════════════════════════════════════════════
-- Once quotes are in, a property manager lines up 2 to 6 bids side by side
-- for the owner or condo board: price before tax, tax (HST/GST/QST in
-- Canada, sales tax in the U.S.), optional scope line items, start date,
-- duration, warranty, payment terms, exclusions and the quote file. The
-- app works out the lowest price, the spread and what's missing; the PM
-- writes a recommendation, prints a board view or sends a read-only share
-- link, then awards the job on PMRFP.
--
--   bid_comparisons       one per comparison, owned by the PM's company.
--                         RLS: members of that company only. The share link
--                         (sha256 of the token, never the token) and the
--                         award stamps are the server's alone.
--   bid_comparison_bids   the bids. Same company (a composite foreign key
--                         ties each bid to a comparison of the SAME company),
--                         at most 6 per comparison. The linked PMRFP company,
--                         the RFP response it came from, the quote file and
--                         the invite stamp are the server's alone.
--
-- Quote files reuse the PRIVATE vendor-certificates bucket from
-- 20261101000100 (prefix quotes/), read through short-lived signed URLs.
-- An award on a comparison linked to a PMRFP RFP goes through the existing
-- pick flow (rfp_interests -> picked, rfp_posts -> awarded); this table
-- only keeps a copy of who won.
--
-- Safe to re-run. The app ships before this runs: every read catches the
-- missing-table error and shows "not switched on yet".

create table if not exists public.bid_comparisons (
  id uuid primary key default gen_random_uuid(),
  -- The property manager's company.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users_profile(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  building_name text check (building_name is null or char_length(building_name) <= 160),
  building_address text check (building_address is null or char_length(building_address) <= 240),
  trade text check (trade is null or char_length(trade) <= 80),
  -- Picks the currency (CAD / USD) and the tax wording. Set from the PM's company, never mixed.
  country text not null default 'CA' check (country in ('CA', 'US')),
  -- Optional: one of the PM's own RFPs on PMRFP (checked by the policies below).
  rfp_id uuid references public.rfp_posts(id) on delete set null,
  -- Scope line items: [{"id": "<short id>", "label": "..."}]; each bid prices them in line_prices.
  scope_items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(scope_items) = 'array' and jsonb_array_length(scope_items) <= 30),
  recommendation text check (recommendation is null or char_length(recommendation) <= 2000),
  -- ── Server-managed (service role only) ──
  share_token_hash text unique check (share_token_hash is null or share_token_hash ~ '^[0-9a-f]{64}$'),
  share_created_at timestamptz,
  awarded_at timestamptz,
  -- A copy of the winner, so the award survives the bid being edited or removed.
  awarded_company text check (awarded_company is null or char_length(awarded_company) <= 160),
  awarded_amount numeric(14, 2) check (awarded_amount is null or awarded_amount >= 0),
  -- The award also went on the linked RFP (its response was picked).
  award_rfp_recorded boolean not null default false,
  award_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets bid_comparison_bids require a comparison of its own company.
  unique (id, organization_id)
);

create table if not exists public.bid_comparison_bids (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null,
  organization_id uuid not null,
  created_by uuid references public.users_profile(id) on delete set null,
  position smallint not null default 0 check (position between 0 and 99),
  company_name text not null check (char_length(company_name) between 1 and 160),
  contact_email text check (contact_email is null or char_length(contact_email) between 3 and 254),
  -- Before tax. Tax is shown separately: an amount, or a percent of the price.
  total_price numeric(14, 2) check (total_price is null or total_price >= 0),
  tax_amount numeric(14, 2) check (tax_amount is null or tax_amount >= 0),
  tax_percent numeric(6, 3) check (tax_percent is null or (tax_percent >= 0 and tax_percent <= 100)),
  -- {"<scope item id>": 1234.5}; a missing or null item reads as "not quoted".
  line_prices jsonb not null default '{}'::jsonb check (jsonb_typeof(line_prices) = 'object'),
  start_date date,
  duration text check (duration is null or char_length(duration) <= 80),
  warranty text check (warranty is null or char_length(warranty) <= 160),
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 160),
  -- Exclusions and notes.
  notes text check (notes is null or char_length(notes) <= 2000),
  -- ── Server-managed (service role only) ──
  -- The bidder's own PMRFP company (picked from the directory, matched by email, or from an RFP response).
  bidder_organization_id uuid references public.organizations(id) on delete set null,
  -- The response on the linked RFP this bid was pulled in from.
  rfp_interest_id uuid references public.rfp_interests(id) on delete set null,
  file_path text check (file_path is null or char_length(file_path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_uploaded_at timestamptz,
  -- "Invite these bidders to PMRFP": once per bid, ever.
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (comparison_id, organization_id) references public.bid_comparisons (id, organization_id) on delete cascade,
  unique (comparison_id, rfp_interest_id)
);

-- The recommendation (the PM's pick) and the award point at a bid. Added
-- after both tables exist; a removed bid clears them.
alter table public.bid_comparisons add column if not exists recommended_bid_id uuid references public.bid_comparison_bids(id) on delete set null;
alter table public.bid_comparisons add column if not exists awarded_bid_id uuid references public.bid_comparison_bids(id) on delete set null;

create index if not exists bid_comparisons_org_idx on public.bid_comparisons (organization_id, updated_at desc);
create index if not exists bid_comparisons_rfp_idx on public.bid_comparisons (rfp_id) where rfp_id is not null;
create index if not exists bid_comparison_bids_comparison_idx on public.bid_comparison_bids (comparison_id, position);
create index if not exists bid_comparison_bids_invited_idx on public.bid_comparison_bids (organization_id, invited_at) where invited_at is not null;

drop trigger if exists bid_comparisons_set_updated on public.bid_comparisons;
create trigger bid_comparisons_set_updated before update on public.bid_comparisons
  for each row execute function public.set_updated_at();
drop trigger if exists bid_comparison_bids_set_updated on public.bid_comparison_bids;
create trigger bid_comparison_bids_set_updated before update on public.bid_comparison_bids
  for each row execute function public.set_updated_at();

-- At most 6 bids per comparison (the app says so first; this is the backstop).
create or replace function public.bid_comparison_bids_cap()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.bid_comparison_bids where comparison_id = new.comparison_id) >= 6 then
    raise exception 'A bid comparison holds at most 6 bids' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists bid_comparison_bids_cap on public.bid_comparison_bids;
create trigger bid_comparison_bids_cap before insert on public.bid_comparison_bids
  for each row execute function public.bid_comparison_bids_cap();

alter table public.bid_comparisons enable row level security;
alter table public.bid_comparison_bids enable row level security;

-- A comparison may only link an RFP its own company (or its creator) posted.
drop policy if exists "bid comparisons member read" on public.bid_comparisons;
create policy "bid comparisons member read" on public.bid_comparisons
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "bid comparisons member insert" on public.bid_comparisons;
create policy "bid comparisons member insert" on public.bid_comparisons
  for insert to authenticated with check (
    public.is_org_member(auth.uid(), organization_id)
    and created_by = auth.uid()
    and (rfp_id is null or exists (
      select 1 from public.rfp_posts r
      where r.id = rfp_id and (r.posted_by_user_id = auth.uid() or r.posted_by_organization_id = organization_id)
    ))
  );

drop policy if exists "bid comparisons member update" on public.bid_comparisons;
create policy "bid comparisons member update" on public.bid_comparisons
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (
    public.is_org_member(auth.uid(), organization_id)
    and (rfp_id is null or exists (
      select 1 from public.rfp_posts r
      where r.id = rfp_id and (r.posted_by_user_id = auth.uid() or r.posted_by_organization_id = organization_id)
    ))
  );

drop policy if exists "bid comparisons member delete" on public.bid_comparisons;
create policy "bid comparisons member delete" on public.bid_comparisons
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "bid comparison bids member read" on public.bid_comparison_bids;
create policy "bid comparison bids member read" on public.bid_comparison_bids
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "bid comparison bids member insert" on public.bid_comparison_bids;
create policy "bid comparison bids member insert" on public.bid_comparison_bids
  for insert to authenticated with check (public.is_org_member(auth.uid(), organization_id) and created_by = auth.uid());

drop policy if exists "bid comparison bids member update" on public.bid_comparison_bids;
create policy "bid comparison bids member update" on public.bid_comparison_bids
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "bid comparison bids member delete" on public.bid_comparison_bids;
create policy "bid comparison bids member delete" on public.bid_comparison_bids
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

-- Explicit Data API access: grants and RLS are separate requirements.
-- Clients write only what a PM types; the share link, the award, the
-- linked company, the RFP response, the file and the invite stamp are the
-- server's alone. Anonymous visitors get nothing (the share page reads
-- through the service role by token hash).
revoke all on public.bid_comparisons from anon;
revoke all on public.bid_comparisons from authenticated;
grant select, insert, update, delete on public.bid_comparisons to service_role;
grant select, delete on public.bid_comparisons to authenticated;
grant insert (organization_id, created_by, title, building_name, building_address, trade, country, rfp_id, scope_items, recommendation, recommended_bid_id)
  on public.bid_comparisons to authenticated;
grant update (title, building_name, building_address, trade, rfp_id, scope_items, recommendation, recommended_bid_id)
  on public.bid_comparisons to authenticated;

revoke all on public.bid_comparison_bids from anon;
revoke all on public.bid_comparison_bids from authenticated;
grant select, insert, update, delete on public.bid_comparison_bids to service_role;
grant select, delete on public.bid_comparison_bids to authenticated;
grant insert (comparison_id, organization_id, created_by, position, company_name, contact_email, total_price, tax_amount, tax_percent, line_prices, start_date, duration, warranty, payment_terms, notes)
  on public.bid_comparison_bids to authenticated;
grant update (position, company_name, contact_email, total_price, tax_amount, tax_percent, line_prices, start_date, duration, warranty, payment_terms, notes)
  on public.bid_comparison_bids to authenticated;

-- Verify:
-- select count(*) from public.bid_comparisons;      → 0
-- select count(*) from public.bid_comparison_bids;  → 0
