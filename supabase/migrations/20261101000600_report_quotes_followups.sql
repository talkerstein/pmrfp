-- ════════════════════════════════════════════════════════════════════
-- Report → Quotes follow-ups: the Repair Cost Summary, email-forward
-- ingestion, and the link from a trade group to the RFP it became.
-- ════════════════════════════════════════════════════════════════════
-- Builds on 20261101000500_report_quotes (quote_reports, items, sends).
--
--   quote_report_rfps       Which RFP a reviewed trade group became. Written
--                           when the user posts the prefilled RFP form, or
--                           links one by hand on the summary page. Members
--                           read, add and remove their own organization's
--                           links; the RFP must be one their organization
--                           posted and the report one it owns.
--   quote_report_summaries  The client-facing Repair Cost Summary's share
--                           settings: whether the street address shows, and
--                           the sha256 of the read-only share link's token
--                           (null = link off). The raw token is shown once
--                           to the user and never stored. Members read the
--                           settings (not the hash); only the server writes.
--   quote_report_inboxes    One private forwarding address per user and
--                           organization: r-<token>@<inbound domain>. The
--                           token routes a forwarded email to its owner and
--                           nothing else (it never signs anyone in). Only the
--                           owner reads their own row; only the server
--                           writes. Rotating replaces the token.
--   quote_report_inbound    Log of forwarded emails: when, the From address
--                           (the owner's audit only; never trusted for
--                           auth), the outcome ("created", "no PDF found",
--                           too big, daily cap…) and the reports it made.
--                           The inbox owner reads their own rows; only the
--                           server writes. The daily purge drops rows after
--                           90 days.
--
-- Nothing here sends email or changes a report on its own: a forwarded PDF
-- becomes a normal upload that goes through the same read → review flow.
--
-- Safe to re-run. The app ships before this runs: every read catches the
-- missing-table error and hides the feature.

-- ── Trade group → RFP ────────────────────────────────────────────────
create table if not exists public.quote_report_rfps (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.quote_reports(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade_slug text not null check (trade_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  rfp_id uuid not null references public.rfp_posts(id) on delete cascade,
  created_by uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (report_id, trade_slug, rfp_id)
);

create index if not exists quote_report_rfps_report_idx on public.quote_report_rfps (report_id);
create index if not exists quote_report_rfps_rfp_idx on public.quote_report_rfps (rfp_id);

-- ── Summary share settings ───────────────────────────────────────────
create table if not exists public.quote_report_summaries (
  report_id uuid primary key references public.quote_reports(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Whose name, company and logo the summary carries.
  prepared_by uuid references public.users_profile(id) on delete set null,
  include_address boolean not null default false,
  share_token_hash text unique check (share_token_hash is null or share_token_hash ~ '^[0-9a-f]{64}$'),
  share_created_at timestamptz,
  open_count integer not null default 0 check (open_count >= 0),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists quote_report_summaries_set_updated on public.quote_report_summaries;
create trigger quote_report_summaries_set_updated before update on public.quote_report_summaries
  for each row execute function public.set_updated_at();

-- ── Forwarding addresses ─────────────────────────────────────────────
create table if not exists public.quote_report_inboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  token text not null unique check (token ~ '^[a-z0-9]{20}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  unique (organization_id, user_id)
);

-- ── Forwarded-email log ──────────────────────────────────────────────
create table if not exists public.quote_report_inbound (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  provider text not null default 'resend' check (provider in ('resend')),
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 200),
  from_address text check (from_address is null or char_length(from_address) <= 254),
  subject text check (subject is null or char_length(subject) <= 200),
  outcome text not null default 'received'
    check (outcome in ('received', 'created', 'no_pdf', 'no_pdf_link', 'too_big', 'not_pdf', 'cap', 'failed')),
  pdf_count integer not null default 0 check (pdf_count >= 0),
  report_ids uuid[] not null default '{}',
  received_at timestamptz not null default now(),
  -- A provider retry of the same email is recognised and skipped.
  unique (provider, provider_message_id)
);

create index if not exists quote_report_inbound_user_idx on public.quote_report_inbound (user_id, received_at desc);
create index if not exists quote_report_inbound_purge_idx on public.quote_report_inbound (received_at);

-- ── Row level security ───────────────────────────────────────────────
alter table public.quote_report_rfps enable row level security;
alter table public.quote_report_summaries enable row level security;
alter table public.quote_report_inboxes enable row level security;
alter table public.quote_report_inbound enable row level security;

drop policy if exists "quote report rfps member read" on public.quote_report_rfps;
create policy "quote report rfps member read" on public.quote_report_rfps
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

-- Only a link between this organization's own report and its own RFP.
drop policy if exists "quote report rfps member insert" on public.quote_report_rfps;
create policy "quote report rfps member insert" on public.quote_report_rfps
  for insert to authenticated with check (
    public.is_org_member(auth.uid(), organization_id)
    and created_by = auth.uid()
    and exists (select 1 from public.quote_reports r where r.id = report_id and r.organization_id = quote_report_rfps.organization_id)
    and exists (select 1 from public.rfp_posts p where p.id = rfp_id and p.posted_by_organization_id = quote_report_rfps.organization_id)
  );

drop policy if exists "quote report rfps member delete" on public.quote_report_rfps;
create policy "quote report rfps member delete" on public.quote_report_rfps
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "quote report summaries member read" on public.quote_report_summaries;
create policy "quote report summaries member read" on public.quote_report_summaries
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "quote report inboxes owner read" on public.quote_report_inboxes;
create policy "quote report inboxes owner read" on public.quote_report_inboxes
  for select to authenticated using (user_id = auth.uid() and public.is_org_member(auth.uid(), organization_id));

drop policy if exists "quote report inbound owner read" on public.quote_report_inbound;
create policy "quote report inbound owner read" on public.quote_report_inbound
  for select to authenticated using ((user_id = auth.uid() and public.is_org_member(auth.uid(), organization_id)) or public.is_admin(auth.uid()));

-- Explicit Data API access: grants and RLS are separate requirements.
revoke all on public.quote_report_rfps from anon;
revoke all on public.quote_report_rfps from authenticated;
grant select, insert, update, delete on public.quote_report_rfps to service_role;
grant select, delete on public.quote_report_rfps to authenticated;
grant insert (report_id, organization_id, trade_slug, rfp_id, created_by) on public.quote_report_rfps to authenticated;

-- The settings, never the link's hash.
revoke all on public.quote_report_summaries from anon;
revoke all on public.quote_report_summaries from authenticated;
grant select, insert, update, delete on public.quote_report_summaries to service_role;
grant select (report_id, organization_id, prepared_by, include_address, share_created_at, open_count, last_opened_at, created_at, updated_at)
  on public.quote_report_summaries to authenticated;

revoke all on public.quote_report_inboxes from anon;
revoke all on public.quote_report_inboxes from authenticated;
grant select, insert, update, delete on public.quote_report_inboxes to service_role;
grant select on public.quote_report_inboxes to authenticated;

revoke all on public.quote_report_inbound from anon;
revoke all on public.quote_report_inbound from authenticated;
grant select, insert, update, delete on public.quote_report_inbound to service_role;
grant select on public.quote_report_inbound to authenticated;

-- Verify:
-- select count(*) from public.quote_report_rfps;        → 0
-- select count(*) from public.quote_report_summaries;   → 0
-- select count(*) from public.quote_report_inboxes;     → 0
-- select count(*) from public.quote_report_inbound;     → 0
