-- ════════════════════════════════════════════════════════════════════
-- Change log for imported tenders (depth plan, Step 2, block 5)
-- ════════════════════════════════════════════════════════════════════
-- "Updated 2026-10-20: closing date moved from Oct 18 to Oct 25."
--
-- One row each time the tender importer (lib/tenders/sync.ts) changes a
-- listing it reads: the closing date, the title, or the status (when the
-- buyer's feed stops listing it). Listings PMRFP never reads (bids&tenders,
-- Bonfire, MERX, BC Bid) have no rows: their page says to check the official
-- posting for addenda. Nothing else is stored: no summary text, no documents.
--
-- Writes: the service role only (the importer). Reads: the service role only
-- (the listing page reads one listing's rows, newest six, and decides what to
-- show). No browser reads this table. A listing deleted takes its log with it.
-- Re-running the importer or this file changes nothing: the table is unique
-- on the listing, the field, both values and the Toronto day. Safe to re-run.

create table if not exists public.rfp_changes (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts (id) on delete cascade,
  -- Denormalised so the page reads by slug without joining rfp_posts.
  slug text not null check (char_length(slug) between 1 and 300),
  field text not null check (field in ('closing_date', 'title', 'status')),
  old_value text not null default '' check (char_length(old_value) <= 500),
  new_value text not null default '' check (char_length(new_value) <= 500),
  -- The importer feed (lib/tenders/sources), for debugging a bad run.
  source_key text check (source_key is null or char_length(source_key) <= 60),
  change_day date not null default ((now() at time zone 'America/Toronto')::date),
  changed_at timestamptz not null default now(),
  constraint rfp_changes_once_a_day unique (rfp_id, field, old_value, new_value, change_day)
);

create index if not exists rfp_changes_slug_idx on public.rfp_changes (slug, changed_at desc);
create index if not exists rfp_changes_rfp_idx on public.rfp_changes (rfp_id);

alter table public.rfp_changes enable row level security;

-- No policies: only the service role (which bypasses RLS) reads and writes.
revoke all on public.rfp_changes from anon;
revoke all on public.rfp_changes from authenticated;
grant select, insert, update, delete on public.rfp_changes to service_role;
