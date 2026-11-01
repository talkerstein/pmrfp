-- ════════════════════════════════════════════════════════════════════
-- Vendor Insurance & WSIB Certificate Tracker (free PM tool)
-- ════════════════════════════════════════════════════════════════════
-- A property manager's company keeps one row per vendor certificate:
-- who the vendor is, what kind of certificate (general liability / WSIB or
-- WCB clearance / auto / U.S. workers' comp / other), insurer, policy,
-- coverage, expiry and the uploaded file. The dashboard shows a status chip
-- (valid / expiring in 30 days / expired / missing) and a daily cron emails
-- the PM a digest when a certificate reaches 30, 14 or 0 days.
--
-- "Request certificate" emails the vendor a one-time link
-- (/vendor-certificate/<token>) where they upload without an account. The
-- raw token only travels in that email; this table keeps its sha256. The
-- upload goes through a server route with the service role.
--
--   vendor_certificates      RLS: members of the owning PM organization
--                            read and write their own rows only. Server-
--                            managed columns (file, token, reminder stamps,
--                            linked PMRFP company) have no client grant.
--   vendor-certificates      PRIVATE storage bucket, no storage policies:
--                            only the service role reads and writes it; the
--                            app signs short-lived URLs for the PM.
--   notification_preferences gains cert_reminders (the digest's own opt-out).
--
-- Safe to re-run. The app ships before this runs: every read catches the
-- missing-table error and shows "not switched on yet".

create table if not exists public.vendor_certificates (
  id uuid primary key default gen_random_uuid(),
  -- The property manager's company that tracks this vendor.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users_profile(id) on delete set null,
  vendor_name text not null check (char_length(vendor_name) between 1 and 160),
  contact_email text check (contact_email is null or char_length(contact_email) between 3 and 254),
  trade text check (trade is null or char_length(trade) <= 80),
  cert_type text not null default 'general_liability'
    check (cert_type in ('general_liability', 'wsib_clearance', 'auto', 'workers_comp', 'other')),
  insurer text check (insurer is null or char_length(insurer) <= 120),
  policy_number text check (policy_number is null or char_length(policy_number) <= 80),
  coverage_amount numeric(14, 2) check (coverage_amount is null or coverage_amount >= 0),
  expires_on date,
  notes text check (notes is null or char_length(notes) <= 500),
  -- Email the vendor for the renewal when the certificate reaches 14 and 0 days.
  remind_vendor boolean not null default false,
  -- ── Server-managed (service role only) ──
  file_path text check (file_path is null or char_length(file_path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_uploaded_at timestamptz,
  uploaded_by text check (uploaded_by is null or uploaded_by in ('pm', 'vendor')),
  -- The vendor's own PMRFP company, when the contact email belongs to one.
  vendor_organization_id uuid references public.organizations(id) on delete set null,
  request_token_hash text unique check (request_token_hash is null or request_token_hash ~ '^[0-9a-f]{64}$'),
  request_expires_at timestamptz,
  request_sent_at timestamptz,
  request_count integer not null default 0 check (request_count >= 0),
  -- The language the PM was using when they asked (the vendor's emails use it).
  request_lang text check (request_lang is null or request_lang in ('en', 'fr', 'es')),
  -- Last digest stage sent ('30', '14', '0') and the expiry it was for, so a
  -- renewed certificate (new expires_on) starts over.
  reminder_stage text check (reminder_stage is null or reminder_stage in ('30', '14', '0')),
  reminder_for date,
  vendor_reminded_stage text check (vendor_reminded_stage is null or vendor_reminded_stage in ('14', '0')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_certificates_org_idx on public.vendor_certificates (organization_id, expires_on);
create index if not exists vendor_certificates_expiry_idx on public.vendor_certificates (expires_on) where expires_on is not null;
create index if not exists vendor_certificates_vendor_org_idx on public.vendor_certificates (vendor_organization_id) where vendor_organization_id is not null;

drop trigger if exists vendor_certificates_set_updated on public.vendor_certificates;
create trigger vendor_certificates_set_updated before update on public.vendor_certificates
  for each row execute function public.set_updated_at();

alter table public.vendor_certificates enable row level security;

drop policy if exists "vendor certs member read" on public.vendor_certificates;
create policy "vendor certs member read" on public.vendor_certificates
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "vendor certs member insert" on public.vendor_certificates;
create policy "vendor certs member insert" on public.vendor_certificates
  for insert to authenticated with check (public.is_org_member(auth.uid(), organization_id) and created_by = auth.uid());

drop policy if exists "vendor certs member update" on public.vendor_certificates;
create policy "vendor certs member update" on public.vendor_certificates
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "vendor certs member delete" on public.vendor_certificates;
create policy "vendor certs member delete" on public.vendor_certificates
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

-- Explicit Data API access: grants and RLS are separate requirements.
-- Clients write only the fields a PM types; the file, the request token,
-- reminder stamps and the linked company are the server's alone.
revoke all on public.vendor_certificates from anon;
revoke all on public.vendor_certificates from authenticated;
grant select, insert, update, delete on public.vendor_certificates to service_role;
grant select, delete on public.vendor_certificates to authenticated;
grant insert (organization_id, created_by, vendor_name, contact_email, trade, cert_type, insurer, policy_number, coverage_amount, expires_on, notes, remind_vendor)
  on public.vendor_certificates to authenticated;
grant update (vendor_name, contact_email, trade, cert_type, insurer, policy_number, coverage_amount, expires_on, notes, remind_vendor)
  on public.vendor_certificates to authenticated;

-- ── The PM digest's own opt-out (the link in the reminder email) ──────
alter table public.notification_preferences add column if not exists cert_reminders boolean not null default true;

-- ── Private bucket for the certificate files ─────────────────────────
-- NO storage.objects policies, on purpose: only the service role (our
-- server) can read or write. Some projects can't write storage.* from the
-- SQL editor; then this only warns and the app creates the bucket (private)
-- on first upload.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('vendor-certificates', 'vendor-certificates', false, 10485760,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false;
exception when others then
  raise warning 'vendor-certificates bucket not created here (%). The app creates it on first upload; or create a PRIVATE bucket named vendor-certificates in Storage.', sqlerrm;
end $$;

-- Verify:
-- select count(*) from public.vendor_certificates;                         → 0
-- select id, public from storage.buckets where id = 'vendor-certificates'; → false
-- select column_name from information_schema.columns
--   where table_name = 'notification_preferences' and column_name = 'cert_reminders';
