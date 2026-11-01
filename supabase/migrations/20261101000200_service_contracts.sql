-- ════════════════════════════════════════════════════════════════════
-- Contract Renewal Calendar (free PM tool)
-- ════════════════════════════════════════════════════════════════════
-- A property manager's company keeps one row per service contract (snow
-- removal, landscaping, HVAC maintenance, janitorial, elevator, fire/life
-- safety, pest control, waste): the building, the trade, the current
-- vendor, the term, the annual value, how many days of warning it wants
-- before the term ends, and whether it renews on its own. The dashboard
-- shows a status chip (active / renewal window / ending soon / expired) and
-- a 12-month timeline; a daily cron emails the PM a digest when a contract
-- enters its renewal window, at 14 days and on the end date.
--
-- "Re-tender on PMRFP" opens the RFP form pre-filled from the contract (and
-- from the RFP it originally came from, when there is one). Posting that RFP
-- stamps it on the contract so the row shows it was re-tendered.
--
--   service_contracts        RLS: members of the owning PM organization read
--                            and write their own rows only. Server-managed
--                            columns (the RFP links, the file, the linked
--                            PMRFP vendor, reminder stamps) have no client
--                            grant: the server checks ownership first.
--   service-contracts        PRIVATE storage bucket, no storage policies:
--                            only the service role reads and writes it; the
--                            app signs short-lived URLs for the PM.
--   notification_preferences gains contract_reminders (the digest's opt-out).
--
-- No shared properties table: the building is plain text on the row.
-- Safe to re-run. The app ships before this runs: every read catches the
-- missing-table error and shows "not switched on yet".

create table if not exists public.service_contracts (
  id uuid primary key default gen_random_uuid(),
  -- The property manager's company that holds this contract.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users_profile(id) on delete set null,
  building_name text check (building_name is null or char_length(building_name) between 1 and 160),
  building_address text check (building_address is null or char_length(building_address) <= 240),
  -- A trade_categories slug (kept as text so a renamed category never breaks a row).
  trade_slug text check (trade_slug is null or trade_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  -- The PM's own words for it ("Winter season, lot and walkways").
  service_detail text check (service_detail is null or char_length(service_detail) <= 160),
  vendor_name text check (vendor_name is null or char_length(vendor_name) <= 160),
  vendor_email text check (vendor_email is null or char_length(vendor_email) between 3 and 254),
  start_date date,
  end_date date,
  annual_value numeric(14, 2) check (annual_value is null or annual_value >= 0),
  -- The PM company's currency (Canada CAD, U.S. USD), set by the app.
  currency text not null default 'CAD' check (currency in ('CAD', 'USD')),
  -- Start the renewal window this many days before the end date.
  notice_days integer not null default 60 check (notice_days between 0 and 365),
  auto_renews boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  -- Which seasonal suggestion created the row (the dashboard hides added ones).
  starter_key text check (starter_key is null or starter_key ~ '^[a-z_]{1,40}$'),
  -- ── Server-managed (service role only) ──
  -- The vendor's own PMRFP company, when the vendor email belongs to one.
  vendor_organization_id uuid references public.organizations(id) on delete set null,
  -- The PMRFP RFP this contract came from (its fields seed the re-tender).
  source_rfp_id uuid references public.rfp_posts(id) on delete set null,
  -- The RFP posted from "Re-tender on PMRFP".
  retender_rfp_id uuid references public.rfp_posts(id) on delete set null,
  retendered_at timestamptz,
  file_path text check (file_path is null or char_length(file_path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_uploaded_at timestamptz,
  -- Last digest stage sent ('window', '14', '0') and the end date it was
  -- for, so a renewed contract (new end date) starts over.
  reminder_stage text check (reminder_stage is null or reminder_stage in ('window', '14', '0')),
  reminder_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_contracts_has_service check (trade_slug is not null or service_detail is not null),
  constraint service_contracts_term_order check (start_date is null or end_date is null or end_date >= start_date)
);

create index if not exists service_contracts_org_idx on public.service_contracts (organization_id, end_date);
create index if not exists service_contracts_end_idx on public.service_contracts (end_date) where end_date is not null;
create index if not exists service_contracts_retender_idx on public.service_contracts (retender_rfp_id) where retender_rfp_id is not null;

drop trigger if exists service_contracts_set_updated on public.service_contracts;
create trigger service_contracts_set_updated before update on public.service_contracts
  for each row execute function public.set_updated_at();

alter table public.service_contracts enable row level security;

drop policy if exists "service contracts member read" on public.service_contracts;
create policy "service contracts member read" on public.service_contracts
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "service contracts member insert" on public.service_contracts;
create policy "service contracts member insert" on public.service_contracts
  for insert to authenticated with check (public.is_org_member(auth.uid(), organization_id) and created_by = auth.uid());

drop policy if exists "service contracts member update" on public.service_contracts;
create policy "service contracts member update" on public.service_contracts
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "service contracts member delete" on public.service_contracts;
create policy "service contracts member delete" on public.service_contracts
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

-- Explicit Data API access: grants and RLS are separate requirements.
-- Clients write only the fields a PM types; the RFP links, the file, the
-- linked vendor company and the reminder stamps are the server's alone.
revoke all on public.service_contracts from anon;
revoke all on public.service_contracts from authenticated;
grant select, insert, update, delete on public.service_contracts to service_role;
grant select, delete on public.service_contracts to authenticated;
grant insert (organization_id, created_by, building_name, building_address, trade_slug, service_detail, vendor_name, vendor_email, start_date, end_date, annual_value, currency, notice_days, auto_renews, notes, starter_key)
  on public.service_contracts to authenticated;
grant update (building_name, building_address, trade_slug, service_detail, vendor_name, vendor_email, start_date, end_date, annual_value, currency, notice_days, auto_renews, notes)
  on public.service_contracts to authenticated;

-- ── The PM digest's own opt-out (the link in the reminder email) ──────
alter table public.notification_preferences add column if not exists contract_reminders boolean not null default true;

-- ── Private bucket for the contract files ────────────────────────────
-- NO storage.objects policies, on purpose: only the service role (our
-- server) can read or write. Some projects can't write storage.* from the
-- SQL editor; then this only warns and the app creates the bucket (private)
-- on first upload.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('service-contracts', 'service-contracts', false, 10485760,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false;
exception when others then
  raise warning 'service-contracts bucket not created here (%). The app creates it on first upload; or create a PRIVATE bucket named service-contracts in Storage.', sqlerrm;
end $$;

-- Verify:
-- select count(*) from public.service_contracts;                         → 0
-- select id, public from storage.buckets where id = 'service-contracts'; → false
-- select column_name from information_schema.columns
--   where table_name = 'notification_preferences' and column_name = 'contract_reminders';
