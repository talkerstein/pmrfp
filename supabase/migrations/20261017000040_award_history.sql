-- ════════════════════════════════════════════════════════════════════
-- Award history + bid results: the raw history behind Award Intelligence.
-- ════════════════════════════════════════════════════════════════════
-- award_history: one canonical award per source record, imported from
-- open-licence / public-domain feeds only (federal Proactive Disclosure,
-- CanadaBuys award files, SEAO, Toronto, Montréal, Ottawa, USAspending,
-- TxDOT). Business names only: a winner that looks like a private
-- individual is stored with winner_business_name NULL and
-- winner_is_individual = true (no personal name is ever written).
--
-- bid_results: who else bid on an award and how close, where the source
-- publishes it (SEAO bid lists, TxDOT bid tabulations). Labelled
-- "unofficial / preliminary" with the as-of date in the app; never a
-- reason for losing. Unnamed (individual) bidders keep their rank and
-- amount with bidder_business_name NULL.
--
-- Neither table backs a public page and neither is in any public view:
-- the rows feed Award Intelligence only (src/lib/contract-history,
-- src/lib/bid-results). Reads: Intel subscribers and admins
-- (has_intel_access(), migration 20261017000001). Writes: service role
-- only (the importers in /api/cron/award-history/*, the admin upload).
-- Safe to re-run.

do $$ begin
  create type public.award_end_date_source as enum ('stated', 'derived_from_title', 'estimated');
exception when duplicate_object then null; end $$;

create table if not exists public.award_history (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source ~ '^[a-z0-9-]{2,40}$'),
  source_key text not null check (length(source_key) between 1 and 300),
  -- The board listing for the same award, as its slug suffix ("qca-<ref>",
  -- "cba-<ref>"), so an award page can find its bid results.
  board_ref text check (board_ref is null or length(board_ref) <= 200),
  title text not null check (length(title) between 1 and 500),
  description text check (description is null or length(description) <= 4000),
  buyer text check (buyer is null or length(buyer) <= 300),
  buyer_key text,
  winner_business_name text check (winner_business_name is null or length(winner_business_name) <= 300),
  winner_key text,
  winner_is_individual boolean not null default false,
  value numeric(16, 2) check (value is null or value >= 0),
  currency text not null check (currency in ('CAD', 'USD')),
  country text not null check (country in ('CA', 'US')),
  province text,
  city text,
  award_date date not null,
  award_date_precision text not null default 'day' check (award_date_precision in ('day', 'month', 'half_year')),
  start_date date,
  end_date date,
  end_date_source public.award_end_date_source,
  -- End date if every option is exercised (USAspending), when stated.
  potential_end_date date,
  number_of_bids integer check (number_of_bids is null or number_of_bids between 0 and 1000),
  trade_slugs text[] not null default '{}',
  notice_url text check (notice_url is null or notice_url ~ '^https://'),
  licence text not null,
  attribution text not null,
  -- The source file / feed date this row was read from.
  as_of date not null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_key),
  -- One currency per country, never mixed.
  constraint award_history_country_currency check ((country = 'CA' and currency = 'CAD') or (country = 'US' and currency = 'USD')),
  constraint award_history_end_source check ((end_date is null) = (end_date_source is null)),
  constraint award_history_winner check (winner_is_individual or winner_business_name is not null)
);

create index if not exists award_history_country_date_idx on public.award_history (country, award_date desc);
create index if not exists award_history_winner_idx on public.award_history (winner_key) where winner_key is not null;
create index if not exists award_history_buyer_idx on public.award_history (buyer_key) where buyer_key is not null;
create index if not exists award_history_board_ref_idx on public.award_history (board_ref) where board_ref is not null;
create index if not exists award_history_end_idx on public.award_history (end_date) where end_date is not null;
create index if not exists award_history_trades_idx on public.award_history using gin (trade_slugs);

create table if not exists public.bid_results (
  id uuid primary key default gen_random_uuid(),
  award_history_id uuid not null references public.award_history(id) on delete cascade,
  bidder_business_name text check (bidder_business_name is null or length(bidder_business_name) <= 300),
  -- winnerKey() of the name, or 'individual:<n>' for an unnamed bidder.
  bidder_key text not null check (length(bidder_key) between 1 and 300),
  bidder_is_individual boolean not null default false,
  bid_amount numeric(16, 2) check (bid_amount is null or bid_amount >= 0),
  currency text not null check (currency in ('CAD', 'USD')),
  rank integer check (rank is null or rank between 1 and 1000),
  status_label text not null check (status_label in ('awarded', 'apparent_low', 'not_awarded', 'submitted')),
  as_of date not null,
  source text not null,
  updated_at timestamptz not null default now(),
  unique (award_history_id, bidder_key),
  constraint bid_results_bidder check (bidder_is_individual or bidder_business_name is not null)
);

create index if not exists bid_results_award_idx on public.bid_results (award_history_id);
create index if not exists bid_results_bidder_idx on public.bid_results (bidder_key);

-- Row level security: Intel subscribers and admins read; nobody else.
alter table public.award_history enable row level security;
alter table public.bid_results enable row level security;

drop policy if exists "award history intel read" on public.award_history;
create policy "award history intel read" on public.award_history
  for select to authenticated using ((select public.has_intel_access(auth.uid())));

drop policy if exists "bid results intel read" on public.bid_results;
create policy "bid results intel read" on public.bid_results
  for select to authenticated using ((select public.has_intel_access(auth.uid())));

revoke all on public.award_history from anon;
revoke all on public.bid_results from anon;
revoke insert, update, delete on public.award_history from authenticated;
revoke insert, update, delete on public.bid_results from authenticated;
grant select on public.award_history to authenticated;
grant select on public.bid_results to authenticated;

-- The slice Award Intelligence merges into its pages (one call per country,
-- one JSON value, so PostgREST's row cap doesn't page it): awards since
-- p_since, plus older ones whose end date is within the last year. Contracts
-- still running (end date within the last year or later: the renewal radar)
-- come first, then the newest awards, up to p_limit. Service role only; the
-- app calls it after checking the viewer has Intel (src/lib/contract-history/load.ts).
create or replace function public.award_history_intel_slice(p_country text, p_since date, p_limit integer default 30000)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) - 'running' order by x.award_date desc, x.id), '[]'::jsonb)
  from (
    select h.id, h.source, h.board_ref, h.title, h.buyer, h.winner_business_name, h.winner_is_individual,
           h.value, h.currency, h.country, h.province, h.city, h.award_date, h.end_date, h.end_date_source,
           h.potential_end_date, h.number_of_bids, h.trade_slugs, h.notice_url, h.attribution,
           exists (select 1 from public.bid_results b where b.award_history_id = h.id) as has_bids,
           coalesce(h.end_date >= current_date - 365, false) as running
    from public.award_history h
    where h.country = p_country
      and (h.award_date >= p_since or h.end_date >= current_date - 365)
    order by running desc, h.award_date desc, h.id
    limit least(greatest(coalesce(p_limit, 30000), 1), 60000)
  ) x;
$$;

revoke all on function public.award_history_intel_slice(text, date, integer) from public;
revoke all on function public.award_history_intel_slice(text, date, integer) from anon, authenticated;
grant execute on function public.award_history_intel_slice(text, date, integer) to service_role;

-- Verify: expect 0 and 0 right after the first run.
select (select count(*) from public.award_history) as award_history_rows,
       (select count(*) from public.bid_results) as bid_results_rows;

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.award_history to service_role;
grant select, insert, update, delete on public.bid_results to service_role;
grant select on public.award_history to authenticated;
grant select on public.bid_results to authenticated;
