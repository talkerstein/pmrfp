-- Public-buyer permissions and "list your tenders free" requests (the city flow).
--
--   buyer_source_requests     what a public buyer submits at /for-public-buyers
--                             (organization, contact, work email, tenders page,
--                             how we may get the tenders, "I'm authorized").
--                             Written by the rate-limited /api/buyer-sources
--                             route with the service role; admins approve or
--                             reject at /admin/buyer-sources.
--   buyer_permissions         the registry: which public buyers said yes / no /
--                             link only, and how (we read their public page,
--                             they email notices, a feed). Admins only; the
--                             daily municipal cron reads it with the service
--                             role. Seeded below from briefs/outreach (Canada
--                             only). The code seed (src/lib/buyers/permissions.ts)
--                             mirrors these rows, and a seed "no" there always
--                             wins over a row here.
--   buyer_permissions_public  view for pages: slug, scope, status, method and
--                             date only. No contacts, quotes or notes.
--
-- Access: anon and members get nothing from either table; admins read and
-- update through RLS (is_admin). Safe to re-run.

-- ── Requests ─────────────────────────────────────────────────────────────
create table if not exists public.buyer_source_requests (
  id uuid primary key default gen_random_uuid(),
  organization text not null check (char_length(organization) between 2 and 200),
  contact_name text not null check (char_length(contact_name) between 2 and 200),
  work_email text not null check (char_length(work_email) between 3 and 254 and work_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  tenders_url text not null check (char_length(tenders_url) <= 500 and tenders_url ~* '^https?://'),
  method text not null check (method in ('read_public_page', 'email_notices', 'feed')),
  feed_url text check (feed_url is null or (char_length(feed_url) <= 500 and feed_url ~* '^https?://')),
  province_code text not null check (province_code in ('ON', 'BC', 'AB', 'NS', 'MB', 'SK', 'QC', 'NB', 'PE', 'NL', 'YT', 'NT', 'NU')),
  country text not null default 'CA' check (country = 'CA'),
  buyer_slug text check (buyer_slug is null or buyer_slug ~ '^[a-z0-9][a-z0-9-]{1,119}$'),
  authorized boolean not null check (authorized),
  lang text not null default 'en' check (lang in ('en', 'fr', 'es')),
  status text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 4000),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A feed request names the feed.
  constraint buyer_source_requests_feed check (method <> 'feed' or feed_url is not null),
  -- A decided request says when.
  constraint buyer_source_requests_decided check (status = 'new' or decided_at is not null)
);

create index if not exists buyer_source_requests_status_idx on public.buyer_source_requests (status, created_at desc);

alter table public.buyer_source_requests enable row level security;

drop policy if exists "buyer source requests admin read" on public.buyer_source_requests;
create policy "buyer source requests admin read" on public.buyer_source_requests
  for select to authenticated using ((select public.is_admin(auth.uid())));

drop policy if exists "buyer source requests admin update" on public.buyer_source_requests;
create policy "buyer source requests admin update" on public.buyer_source_requests
  for update to authenticated
  using ((select public.is_admin(auth.uid())))
  with check ((select public.is_admin(auth.uid())));

revoke all on public.buyer_source_requests from anon;
revoke all on public.buyer_source_requests from authenticated;
grant select on public.buyer_source_requests to authenticated;
grant update (status, admin_notes, decided_by, decided_at, updated_at) on public.buyer_source_requests to authenticated;

-- ── Registry ─────────────────────────────────────────────────────────────
create table if not exists public.buyer_permissions (
  buyer_slug text primary key check (buyer_slug ~ '^[a-z0-9][a-z0-9-]{1,119}$'),
  buyer_name text not null check (char_length(buyer_name) between 1 and 200),
  province_code text check (province_code is null or province_code in ('ON', 'BC', 'AB', 'NS', 'MB', 'SK', 'QC', 'NB', 'PE', 'NL', 'YT', 'NT', 'NU')),
  country text not null default 'CA' check (country = 'CA'),
  -- 'platform': a portal many buyers use (BC Bid, NBON); it only names hosts we never read.
  scope text not null default 'buyer' check (scope in ('buyer', 'platform')),
  hosts text[] not null default '{}',
  status text not null check (status in ('yes', 'link_only', 'no', 'pending')),
  -- How we may get the tenders. A yes can come before a method is agreed (null): nothing imports until one is set.
  method text check (method is null or method in ('read_public_page', 'email_notices', 'feed')),
  feed_url text check (feed_url is null or (char_length(feed_url) <= 500 and feed_url ~* '^https?://')),
  granted_on date,
  contact text check (contact is null or char_length(contact) <= 300),
  reply_quote text check (reply_quote is null or char_length(reply_quote) <= 2000),
  notes text check (notes is null or char_length(notes) <= 4000),
  source_request_id uuid references public.buyer_source_requests (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists buyer_permissions_status_idx on public.buyer_permissions (status);

alter table public.buyer_permissions enable row level security;

drop policy if exists "buyer permissions admin read" on public.buyer_permissions;
create policy "buyer permissions admin read" on public.buyer_permissions
  for select to authenticated using ((select public.is_admin(auth.uid())));

drop policy if exists "buyer permissions admin insert" on public.buyer_permissions;
create policy "buyer permissions admin insert" on public.buyer_permissions
  for insert to authenticated with check ((select public.is_admin(auth.uid())));

drop policy if exists "buyer permissions admin update" on public.buyer_permissions;
create policy "buyer permissions admin update" on public.buyer_permissions
  for update to authenticated
  using ((select public.is_admin(auth.uid())))
  with check ((select public.is_admin(auth.uid())));

revoke all on public.buyer_permissions from anon;
revoke all on public.buyer_permissions from authenticated;
grant select, insert, update on public.buyer_permissions to authenticated;

-- Public slice for buyer pages (owner-run, like sponsors_public): no contacts, quotes or notes.
create or replace view public.buyer_permissions_public as
  select buyer_slug, scope, status, method, granted_on
  from public.buyer_permissions;

grant select on public.buyer_permissions_public to anon, authenticated;

-- ── Seed (briefs/outreach/buyer-permissions.csv + do-not-list.csv, Canada only) ──
-- Existing rows are left as they are (an admin may have updated them).
insert into public.buyer_permissions (buyer_slug, buyer_name, province_code, scope, hosts, status, method, granted_on, contact, reply_quote, notes) values
  ('city-of-nanaimo', 'City of Nanaimo', 'BC', 'buyer', '{}', 'yes', null, '2026-10-20',
   'Amanda Weinmeyer, Purchasing Admin Clerk · procurement@nanaimo.ca',
   'Thank you for your email. That would be acceptable. Please let me know if you require anything further.',
   'Reply to our Oct 15 request to list public facilities and construction tenders (title, short summary, closing date, procurement contact, link back). The City''s bid page links out to nanaimo.bidsandtenders.ca, whose terms bar automated reads, so nothing is imported: link-out only until the City emails notices to info@pmrfp.com or offers a feed.'),
  ('nbon', 'New Brunswick Opportunities Network (NBON), Service New Brunswick', 'NB', 'platform', '{nbon-rpanb.gnb.ca}', 'link_only', null, '2026-10-09',
   'Natasha Currie · NBON@snb.ca',
   'we would have no issues with you providing a link to our web-based e-tendering system, the New Brunswick Opportunities Network (NBON)',
   'No API, export or licence offered; no bot or feed access granted. Link back to the official NBON posting only.'),
  ('town-of-cochrane', 'Town of Cochrane (AB)', 'AB', 'buyer', '{}', 'no', null, '2026-10-09', 'procurement@cochrane.ca', null,
   'Asked us not to post their opportunities. Not the Cochrane District Services Board (ON), a different buyer.'),
  ('bc-bid', 'BC Bid (Province of British Columbia)', 'BC', 'platform', '{bcbid.gov.bc.ca,www.bcbid.gov.bc.ca}', 'no', null, '2026-10-09', 'bcbid@gov.bc.ca', null,
   'No bot scraping of BC Bid; no API.'),
  ('city-of-kawartha-lakes', 'City of Kawartha Lakes', 'ON', 'buyer', '{}', 'no', null, '2026-10-16', 'vendors@kawarthalakes.ca', null,
   'Declined: advertises on bids&tenders only.'),
  ('town-of-newmarket', 'Town of Newmarket', 'ON', 'buyer', '{}', 'no', null, '2026-10-16', 'procurement@newmarket.ca', null,
   'Declined: not posting on additional sites.'),
  ('edmonton-public-schools', 'Edmonton Public Schools', 'AB', 'buyer', '{}', 'no', null, '2026-10-16', 'pcs.general.information@epsb.ca', null,
   'Declined: no vendor solicitation by email or phone (postal only). Do not email again.')
on conflict (buyer_slug) do nothing;

-- Explicit backend privileges; new tables no longer inherit these after Oct 30.
grant select, insert, update, delete on public.buyer_source_requests to service_role;
grant select, insert, update, delete on public.buyer_permissions to service_role;
grant select on public.buyer_permissions_public to service_role;
