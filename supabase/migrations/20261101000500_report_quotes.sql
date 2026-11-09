-- ════════════════════════════════════════════════════════════════════
-- Report → Quotes (free tool for realtors, landlords and property managers)
-- ════════════════════════════════════════════════════════════════════
-- A realtor or property manager uploads an inspection or condition report
-- (PDF). The app reads the repair items out of it, groups them by trade,
-- the user reviews and edits the list, then turns each trade group into a
-- draft RFP or (realtors) quote requests to the trades on their
-- trusted-trades page.
--
--   quote_reports        One row per report (or hand-typed list). RLS:
--                        members of the owning organization read and edit
--                        their own rows only. Server-managed columns (the
--                        stored file, extraction status, the 90-day delete
--                        date) have no client grant.
--   quote_report_items   The extracted / typed repair items. Same
--                        organization scope; an item can only point at a
--                        report of the same organization.
--   quote_report_sends   Log of quote requests sent from a report: who
--                        started it and when, who got which trade group,
--                        whether the report was attached and, when it was,
--                        the sha256 of the share link's token. Members read
--                        their own; only the server writes.
--   report-quotes        PRIVATE storage bucket. No grant to anon or signed-in
--                        users (see the restrictive policy at the end): only
--                        the service role (our server) reads and writes it,
--                        and the app signs 2-minute URLs.
--
-- Privacy: the file is never sent to trades unless the user ticks "attach
-- report" for a quote request; then the trade gets a PMRFP link that signs a
-- fresh 2-minute URL on each open, until report_deleted_after. A daily cron
-- (/api/cron/report-quotes-purge) deletes stored files once
-- report_deleted_after (upload + 90 days) has passed.
--
-- Safe to re-run. The app ships before this runs: every read catches the
-- missing-table error and shows "not switched on yet".

create table if not exists public.quote_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users_profile(id) on delete set null,
  title text not null default 'Inspection report' check (char_length(title) between 1 and 160),
  report_type text not null default 'home_inspection'
    check (report_type in ('home_inspection', 'pre_listing', 'move_out', 'annual', 'condition_assessment', 'reserve_fund', 'other')),
  source text not null default 'upload' check (source in ('upload', 'manual')),
  -- Plain text, never shared unless the user includes it.
  building_name text check (building_name is null or char_length(building_name) <= 160),
  street_address text check (street_address is null or char_length(street_address) <= 200),
  -- What trades see by default: the city and province/state.
  city text check (city is null or char_length(city) <= 120),
  region text check (region is null or char_length(region) <= 60),
  country text not null default 'CA' check (country in ('CA', 'US')),
  -- Set when the user saves the reviewed list; nothing is sent before it.
  reviewed_at timestamptz,
  -- ── Server-managed (service role only) ──
  file_path text check (file_path is null or char_length(file_path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_size integer check (file_size is null or (file_size > 0 and file_size <= 15728640)),
  extraction_status text not null default 'none'
    check (extraction_status in ('none', 'running', 'done', 'failed', 'unavailable')),
  extraction_model text check (extraction_model is null or char_length(extraction_model) <= 80),
  extracted_at timestamptz,
  report_deleted_after timestamptz not null default (now() + interval '90 days'),
  file_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_reports_org_idx on public.quote_reports (organization_id, created_at desc);
create index if not exists quote_reports_purge_idx on public.quote_reports (report_deleted_after) where file_path is not null;

drop trigger if exists quote_reports_set_updated on public.quote_reports;
create trigger quote_reports_set_updated before update on public.quote_reports
  for each row execute function public.set_updated_at();

create table if not exists public.quote_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.quote_reports(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- A trade_categories slug; null = "Other / unassigned" until the user picks one.
  trade_slug text check (trade_slug is null or trade_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  item text not null check (char_length(item) between 1 and 500),
  location text check (location is null or char_length(location) <= 160),
  urgency text not null default 'soon' check (urgency in ('safety', 'soon', 'monitor')),
  source_page integer check (source_page is null or source_page between 1 and 2000),
  position integer not null default 0 check (position >= 0),
  origin text not null default 'manual' check (origin in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_report_items_report_idx on public.quote_report_items (report_id, position);
create index if not exists quote_report_items_org_idx on public.quote_report_items (organization_id);

drop trigger if exists quote_report_items_set_updated on public.quote_report_items;
create trigger quote_report_items_set_updated before update on public.quote_report_items
  for each row execute function public.set_updated_at();

create table if not exists public.quote_report_sends (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.quote_reports(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Who started this request and when (CASL / CAN-SPAM: every quote request
  -- is a one-off inquiry a signed-in user sent; nothing is sent on a schedule).
  initiated_by uuid not null references public.users_profile(id) on delete cascade,
  initiated_at timestamptz not null default now(),
  trade_slug text not null check (trade_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  recipient_organization_ids uuid[] not null default '{}',
  item_count integer not null default 0 check (item_count >= 0),
  include_address boolean not null default false,
  attach_report boolean not null default false,
  share_token_hash text unique check (share_token_hash is null or share_token_hash ~ '^[0-9a-f]{64}$'),
  share_expires_at timestamptz,
  open_count integer not null default 0 check (open_count >= 0),
  last_opened_at timestamptz
);

create index if not exists quote_report_sends_report_idx on public.quote_report_sends (report_id, initiated_at desc);

-- ── Row level security ───────────────────────────────────────────────
alter table public.quote_reports enable row level security;
alter table public.quote_report_items enable row level security;
alter table public.quote_report_sends enable row level security;

drop policy if exists "quote reports member read" on public.quote_reports;
create policy "quote reports member read" on public.quote_reports
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "quote reports member insert" on public.quote_reports;
create policy "quote reports member insert" on public.quote_reports
  for insert to authenticated with check (public.is_org_member(auth.uid(), organization_id) and created_by = auth.uid());

drop policy if exists "quote reports member update" on public.quote_reports;
create policy "quote reports member update" on public.quote_reports
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "quote reports member delete" on public.quote_reports;
create policy "quote reports member delete" on public.quote_reports
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "quote report items member read" on public.quote_report_items;
create policy "quote report items member read" on public.quote_report_items
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "quote report items member insert" on public.quote_report_items;
create policy "quote report items member insert" on public.quote_report_items
  for insert to authenticated with check (
    public.is_org_member(auth.uid(), organization_id)
    and exists (select 1 from public.quote_reports r where r.id = report_id and r.organization_id = quote_report_items.organization_id)
  );

drop policy if exists "quote report items member update" on public.quote_report_items;
create policy "quote report items member update" on public.quote_report_items
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "quote report items member delete" on public.quote_report_items;
create policy "quote report items member delete" on public.quote_report_items
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "quote report sends member read" on public.quote_report_sends;
create policy "quote report sends member read" on public.quote_report_sends
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

-- Explicit Data API access: grants and RLS are separate requirements.
-- Clients write only what a user types; the file, the extraction result,
-- the delete date and the send log are the server's alone.
revoke all on public.quote_reports from anon;
revoke all on public.quote_reports from authenticated;
grant select, insert, update, delete on public.quote_reports to service_role;
grant select, delete on public.quote_reports to authenticated;
grant insert (organization_id, created_by, title, report_type, source, building_name, street_address, city, region, country)
  on public.quote_reports to authenticated;
grant update (title, report_type, building_name, street_address, city, region, reviewed_at)
  on public.quote_reports to authenticated;

revoke all on public.quote_report_items from anon;
revoke all on public.quote_report_items from authenticated;
grant select, insert, update, delete on public.quote_report_items to service_role;
grant select, delete on public.quote_report_items to authenticated;
grant insert (report_id, organization_id, trade_slug, item, location, urgency, source_page, position, origin)
  on public.quote_report_items to authenticated;
grant update (trade_slug, item, location, urgency, source_page, position)
  on public.quote_report_items to authenticated;

revoke all on public.quote_report_sends from anon;
revoke all on public.quote_report_sends from authenticated;
grant select, insert, update, delete on public.quote_report_sends to service_role;
grant select on public.quote_report_sends to authenticated;

-- ── Private bucket for the report files ──────────────────────────────
-- Some projects can't write storage.* from the SQL editor ("must be owner
-- of table buckets"). Then each block only warns: the app creates the
-- bucket itself (private, PDF only, 15 MB) on first upload.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('report-quotes', 'report-quotes', false, 15728640, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];
exception when others then
  raise warning 'report-quotes bucket not created here (%). The app creates it on first upload; or create a PRIVATE bucket named report-quotes in Storage.', sqlerrm;
end $$;

-- Belt and braces: a RESTRICTIVE policy is ANDed with every permissive one,
-- so even a broad storage policy added later can never let anon or a
-- signed-in user list, read, write or sign an object in this bucket. Other
-- buckets are unaffected (the expression is true for them). The service
-- role bypasses RLS, which is how our server reads and writes the files.
do $$
begin
  drop policy if exists "report-quotes server only" on storage.objects;
  create policy "report-quotes server only" on storage.objects
    as restrictive for all to anon, authenticated
    using (bucket_id <> 'report-quotes')
    with check (bucket_id <> 'report-quotes');
exception when others then
  raise warning 'report-quotes storage policy not created here (%). The bucket is still private with no permissive policy, so only the service role can reach it.', sqlerrm;
end $$;

-- Verify:
-- select count(*) from public.quote_reports;                              → 0
-- select id, public, file_size_limit from storage.buckets where id = 'report-quotes'; → false, 15728640
-- select policyname, permissive from pg_policies
--   where schemaname = 'storage' and tablename = 'objects' and policyname = 'report-quotes server only'; → RESTRICTIVE
