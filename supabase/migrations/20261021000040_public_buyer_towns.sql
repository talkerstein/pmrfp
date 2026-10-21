-- Public-buyer accounts and managed town pages (PMRFP for Towns, Part A).
--
-- 1. organization_type 'public_buyer' and primary_role 'public_buyer'
--    (the CHECK constraints widen, the same way 'supplier' and 'landlord'
--    were added), and handle_new_user() accepts 'public_buyer' from sign-up
--    metadata. The role grants nothing by itself: no RLS policy names it,
--    and a page is managed only through buyer_pages (server writes only).
-- 2. buyer_pages: one row per managed buyer page, keyed by
--    "<province-slug>/<buyer-slug>" (the /buyers/<province>/<slug> URL).
--    One public-buyer organization per page (primary key) and one page per
--    organization (unique). Holds what the verified buyer edits: logo,
--    procurement contact (public only when show_contact), where bids are
--    posted, vendor registration link, a short intro and an optional list
--    of upcoming purchases (title + expected month, no documents).
-- 3. buyer_pages_public: the slice pages read (anon). The contact only when
--    the buyer ticked show_contact; nothing for a suspended organization.
-- 4. buyer_claims: every "Claim this page" (verified on the spot by email
--    domain, waiting for admin review, rejected, or turned into a join
--    request because the page already has a managing organization).
-- 5. buyer_domains: email domains a PMRFP admin trusted for a buyer, on top
--    of the directory's (src/lib/buyers/directory.json `domains`).
--
-- Writes go through the server (service role) after it checks who is
-- asking; members read their own organization's page and their own claims;
-- admins read everything. Canada only. Safe to re-run.

-- ── 1. Types ──────────────────────────────────────────────────────────────
alter table public.organizations drop constraint if exists organizations_organization_type_check;
alter table public.organizations add constraint organizations_organization_type_check
  check (organization_type in ('trade_company','property_manager','builder','owner','admin','supplier','landlord','public_buyer'));

alter table public.users_profile drop constraint if exists users_profile_primary_role_check;
alter table public.users_profile add constraint users_profile_primary_role_check
  check (primary_role in ('trade','property_manager','admin','super_admin','visitor','supplier','real_estate_agent','talent','public_buyer'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested text := nullif(new.raw_user_meta_data->>'primary_role', '');
begin
  insert into public.users_profile (id, email, full_name, primary_role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when requested in ('trade', 'property_manager', 'supplier', 'real_estate_agent', 'visitor', 'talent', 'public_buyer') then requested
      else 'trade'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── 2. Managed pages ──────────────────────────────────────────────────────
create table if not exists public.buyer_pages (
  buyer_key text primary key check (buyer_key ~ '^[a-z0-9-]{2,40}/[a-z0-9][a-z0-9-]{0,119}$'),
  province_code text not null check (province_code in ('ON', 'BC', 'AB', 'NS', 'MB', 'SK', 'QC', 'NB', 'PE', 'NL', 'YT', 'NT', 'NU')),
  country text not null default 'CA' check (country = 'CA'),
  buyer_name text not null check (char_length(buyer_name) between 1 and 200),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  verified_method text not null check (verified_method in ('email_domain', 'admin')),
  verified_domain text check (verified_domain is null or char_length(verified_domain) <= 253),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz not null default now(),
  logo_url text check (logo_url is null or (char_length(logo_url) <= 500 and logo_url ~* '^https://')),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  show_contact boolean not null default false,
  bids_url text check (bids_url is null or (char_length(bids_url) <= 500 and bids_url ~* '^https?://')),
  platform_url text check (platform_url is null or (char_length(platform_url) <= 500 and platform_url ~* '^https?://')),
  vendor_registration_url text check (vendor_registration_url is null or (char_length(vendor_registration_url) <= 500 and vendor_registration_url ~* '^https?://')),
  intro text check (intro is null or char_length(intro) <= 600),
  -- [{ "title": "Arena roof replacement", "month": "2027-04" }, …], at most 12.
  upcoming jsonb not null default '[]'::jsonb check (jsonb_typeof(upcoming) = 'array' and jsonb_array_length(upcoming) <= 12),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists buyer_pages_province_idx on public.buyer_pages (province_code);

alter table public.buyer_pages enable row level security;

drop policy if exists "buyer pages member or admin read" on public.buyer_pages;
create policy "buyer pages member or admin read" on public.buyer_pages
  for select to authenticated using (
    (select public.is_admin(auth.uid())) or public.is_org_member(auth.uid(), organization_id)
  );

revoke all on public.buyer_pages from anon;
revoke all on public.buyer_pages from authenticated;
grant select on public.buyer_pages to authenticated;
grant select, insert, update, delete on public.buyer_pages to service_role;

-- ── 3. What pages read ────────────────────────────────────────────────────
create or replace view public.buyer_pages_public as
  select
    p.buyer_key,
    p.province_code,
    p.buyer_name,
    o.name as organization_name,
    p.verified_at,
    p.logo_url,
    case when p.show_contact then p.contact_email end as contact_email,
    case when p.show_contact then p.contact_phone end as contact_phone,
    p.bids_url,
    p.platform_url,
    p.vendor_registration_url,
    p.intro,
    p.upcoming,
    p.updated_at
  from public.buyer_pages p
  join public.organizations o on o.id = p.organization_id
  where o.status = 'active';

grant select on public.buyer_pages_public to anon, authenticated, service_role;

-- ── 4. Claims ─────────────────────────────────────────────────────────────
create table if not exists public.buyer_claims (
  id uuid primary key default gen_random_uuid(),
  buyer_key text not null check (buyer_key ~ '^[a-z0-9-]{2,40}/[a-z0-9][a-z0-9-]{0,119}$'),
  buyer_name text not null check (char_length(buyer_name) between 1 and 200),
  province_code text not null check (province_code in ('ON', 'BC', 'AB', 'NS', 'MB', 'SK', 'QC', 'NB', 'PE', 'NL', 'YT', 'NT', 'NU')),
  country text not null default 'CA' check (country = 'CA'),
  user_id uuid not null references public.users_profile (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  email text not null check (char_length(email) between 3 and 254),
  email_domain text check (email_domain is null or char_length(email_domain) <= 253),
  full_name text check (full_name is null or char_length(full_name) <= 120),
  job_title text check (job_title is null or char_length(job_title) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'join_requested', 'cancelled')),
  -- Why it waits for review (free mailbox, domain not on file, shared domain…), or how it was verified.
  reason text check (reason is null or char_length(reason) <= 60),
  method text check (method is null or method in ('email_domain', 'admin')),
  join_request_id uuid references public.organization_join_requests (id) on delete set null,
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_claims_decided check (status = 'pending' or decided_at is not null)
);

-- One open claim per person per page.
create unique index if not exists buyer_claims_one_pending on public.buyer_claims (buyer_key, user_id) where status = 'pending';
create index if not exists buyer_claims_status_idx on public.buyer_claims (status, created_at desc);
create index if not exists buyer_claims_user_idx on public.buyer_claims (user_id, created_at desc);

alter table public.buyer_claims enable row level security;

drop policy if exists "buyer claims own or admin read" on public.buyer_claims;
create policy "buyer claims own or admin read" on public.buyer_claims
  for select to authenticated using (user_id = auth.uid() or (select public.is_admin(auth.uid())));

revoke all on public.buyer_claims from anon;
revoke all on public.buyer_claims from authenticated;
grant select on public.buyer_claims to authenticated;
grant select, insert, update, delete on public.buyer_claims to service_role;

-- ── 5. Trusted domains ────────────────────────────────────────────────────
create table if not exists public.buyer_domains (
  id uuid primary key default gen_random_uuid(),
  buyer_key text not null check (buyer_key ~ '^[a-z0-9-]{2,40}/[a-z0-9][a-z0-9-]{0,119}$'),
  domain text not null check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' and char_length(domain) <= 253),
  added_by uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (buyer_key, domain)
);

alter table public.buyer_domains enable row level security;

drop policy if exists "buyer domains admin read" on public.buyer_domains;
create policy "buyer domains admin read" on public.buyer_domains
  for select to authenticated using ((select public.is_admin(auth.uid())));

revoke all on public.buyer_domains from anon;
revoke all on public.buyer_domains from authenticated;
grant select on public.buyer_domains to authenticated;
grant select, insert, update, delete on public.buyer_domains to service_role;
