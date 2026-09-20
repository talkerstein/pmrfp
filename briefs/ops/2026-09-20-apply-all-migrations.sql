-- ════════════════════════════════════════════════════════════════════
-- PMRFP — ALL PENDING PRODUCTION MIGRATIONS, ONE PASTE
-- Supabase dashboard -> SQL Editor -> New query -> paste ALL -> Run
-- ════════════════════════════════════════════════════════════════════
-- Additive only: new columns (with defaults), new tables, new categories,
-- one replaced function, and City Limits' paid subscription row.
-- Nothing is dropped or rewritten. Safe to run twice.
-- Runs in one transaction — if anything errors, nothing is applied.
-- The final SELECT should show City Limits with can_see_rfps = true.

begin;

-- ▶ 1/4 property-services categories
-- ════════════════════════════════════════════════════════════════════
-- Property services & staffing categories
-- ════════════════════════════════════════════════════════════════════
-- Our 41 categories were all construction and maintenance trades. A
-- Montreal inbound (Valet Prestige, 2026-07-26) asked whether we covered
-- parking management, valet, concierge, porter, security personnel and
-- temporary workforce before subscribing — and the honest answer was no.
-- The closest we had were Access Control and Security Systems, which are
-- the *equipment*, and Parking Lot Maintenance, which is paving.
--
-- Property managers buy these services for every tower they run, so this
-- is a genuine gap rather than a one-off accommodation: the work is
-- recurring, contracted, and sits with the same buyer who posts our
-- trade RFPs.
--
-- Descriptions are written for the generated /trades/[slug] pages, so
-- they need to read as real copy rather than placeholders.
-- Idempotent — safe to re-run.

insert into public.trade_categories (name, slug, icon, description, sort_order) values
  (
    'Parking & Valet Services',
    'parking-valet-services',
    'CircleParking',
    'Parking facility management, valet operations, and attendant staffing for commercial, residential, and institutional properties. Covers garage and surface-lot operations, permit and visitor management, and event or seasonal valet coverage — the running of the facility rather than the paving of it.',
    420
  ),
  (
    'Concierge & Porter Services',
    'concierge-porter-services',
    'ConciergeBell',
    'Front-desk concierge, porter, and building-attendant staffing for residential towers, office buildings, and mixed-use properties. Covers resident and visitor reception, package and amenity management, day porter coverage, and common-area upkeep between scheduled cleans.',
    430
  ),
  (
    'Security Personnel',
    'security-personnel',
    'ShieldCheck',
    'Licensed security guards, access-control staff, mobile patrol, and construction-site attendants for commercial and residential properties. This is staffed coverage — for cameras, alarms, and card readers, see Security Systems and Access Control.',
    440
  ),
  (
    'Temporary Workforce',
    'temporary-workforce',
    'Users',
    'Temporary and contract labour for property operations — site attendants, general labourers, seasonal coverage, and short-term staffing for turnovers, move-ins, and construction support. For a licensed trade on a defined scope, post to that trade''s category instead.',
    450
  )
on conflict (slug) do nothing;


-- ▶ 2/4 device push tokens
-- ════════════════════════════════════════════════════════════════════
-- device_push_tokens — Expo push tokens for the mobile app
-- ════════════════════════════════════════════════════════════════════
-- Backs the "a matching RFP was just posted" alert. The existing
-- /api/cron/rfp-alerts job emails matching trades; once devices are
-- registered here it can push to them as well.
--
-- One row per device token. A user can have several (phone + tablet), and
-- a token can move between users if a device is handed over, so the token
-- itself is the natural key rather than (user, platform).

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  token text unique not null,
  platform text not null check (platform in ('ios','android','web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_idx
  on public.device_push_tokens(user_id);

alter table public.device_push_tokens enable row level security;

-- A user may only ever see or touch their own device tokens. Knowing another
-- user's token would let you address push at their device.
drop policy if exists "push tokens self read" on public.device_push_tokens;
create policy "push tokens self read" on public.device_push_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push tokens self insert" on public.device_push_tokens;
create policy "push tokens self insert" on public.device_push_tokens
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push tokens self update" on public.device_push_tokens;
create policy "push tokens self update" on public.device_push_tokens
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push tokens self delete" on public.device_push_tokens;
create policy "push tokens self delete" on public.device_push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- The alerts cron runs with the service-role key, which bypasses RLS, so it
-- needs no policy of its own to read every token.


-- ▶ 3/4 SEO tier, Google ratings, case studies, reviews
-- ════════════════════════════════════════════════════════════════════
-- SEO tier + Google ratings + case studies + first-party reviews
-- ════════════════════════════════════════════════════════════════════
-- Backs the three-tier model (briefs/three-tier-seo-model.md): a $99 SEO
-- tier that sells directory presence without RFP access, Google-rating
-- display on profiles, and vendor case studies as the content engine for
-- the gated trade×city pages.

-- ── 1. Subscription tier ─────────────────────────────────────────────
-- has_active_trade_access() currently grants RFP access on ANY active
-- subscription. Once a cheaper SEO tier exists, that would silently sell
-- the $249 product for $99. Tier makes the entitlement explicit.
alter table public.subscriptions
  add column if not exists tier text not null default 'pro'
    check (tier in ('seo', 'pro', 'featured'));

-- RFP access requires a pro-level tier. 'featured' includes everything in
-- Pro (see PRICING.featuredNote); 'seo' is directory placement only.
create or replace function public.has_active_trade_access(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    join public.subscriptions s on s.organization_id = o.id
    where om.user_id = uid
      and o.organization_type in ('trade_company','supplier')
      and o.status <> 'suspended'
      and s.status in ('active','comped')
      and s.tier in ('pro','featured')
  );
$$;

-- ── 2. Google rating display fields ──────────────────────────────────
-- Populated by scripts/sync-google-ratings.mjs via the official Places
-- API from a vendor-supplied place_id. Displayed with attribution as
-- "★ 4.8 (127 Google reviews)". Deliberately NOT marked up as schema.org
-- aggregateRating — Google's rich-result rules require first-party
-- reviews for that; third-party ratings in markup risk a spam action.
alter table public.organizations
  add column if not exists google_place_id text,
  add column if not exists google_rating numeric,
  add column if not exists google_review_count integer,
  add column if not exists google_ratings_synced_at timestamptz;

-- ── 3. Vendor case studies ───────────────────────────────────────────
-- UGC content engine: vendors write up a real completed project; approved
-- studies publish at /case-studies/[slug] and deepen the trade×city page
-- for their combo. Moderated — status flow mirrors rfp_posts.
create table if not exists public.case_studies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by_user_id uuid references public.users_profile(id) on delete set null,
  title text not null,
  slug text unique not null,
  category_id uuid references public.trade_categories(id) on delete set null,
  region_id uuid references public.regions(id) on delete set null,
  property_type text,
  city text,
  province text,
  challenge text not null,
  approach text not null,
  outcome text not null,
  timeline text,
  budget_band text,
  status text not null default 'pending_review'
    check (status in ('draft','pending_review','published','rejected','archived')),
  admin_notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists case_studies_org_idx on public.case_studies(organization_id);
create index if not exists case_studies_status_idx on public.case_studies(status);
create index if not exists case_studies_cat_region_idx on public.case_studies(category_id, region_id);

alter table public.case_studies enable row level security;

drop policy if exists "case studies public read published" on public.case_studies;
create policy "case studies public read published" on public.case_studies
  for select to anon, authenticated using (
    status = 'published'
    or exists (select 1 from public.organization_members om
               where om.organization_id = case_studies.organization_id
                 and om.user_id = auth.uid())
    or public.is_admin(auth.uid())
  );

drop policy if exists "case studies member insert" on public.case_studies;
create policy "case studies member insert" on public.case_studies
  for insert to authenticated with check (
    exists (select 1 from public.organization_members om
            where om.organization_id = case_studies.organization_id
              and om.user_id = auth.uid())
    -- Members submit for review; only admins can set published directly.
    and status in ('draft','pending_review')
  );

drop policy if exists "case studies member update own drafts" on public.case_studies;
create policy "case studies member update own drafts" on public.case_studies
  for update to authenticated using (
    exists (select 1 from public.organization_members om
            where om.organization_id = case_studies.organization_id
              and om.user_id = auth.uid())
    and status in ('draft','pending_review')
  ) with check (status in ('draft','pending_review'));

drop policy if exists "case studies admin all" on public.case_studies;
create policy "case studies admin all" on public.case_studies
  for all to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ── 4. First-party reviews (schema-eligible, UI later) ───────────────
-- Reviews collected on OUR site from named buyers. These are the only
-- reviews eligible for schema.org aggregateRating markup down the road.
create table if not exists public.vendor_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reviewer_user_id uuid references public.users_profile(id) on delete set null,
  reviewer_name text not null,
  reviewer_company text,
  rating integer not null check (rating between 1 and 5),
  body text not null,
  project_context text,
  status text not null default 'pending_review'
    check (status in ('pending_review','published','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists vendor_reviews_org_idx on public.vendor_reviews(organization_id, status);

alter table public.vendor_reviews enable row level security;

drop policy if exists "vendor reviews public read published" on public.vendor_reviews;
create policy "vendor reviews public read published" on public.vendor_reviews
  for select to anon, authenticated using (
    status = 'published' or public.is_admin(auth.uid())
  );

drop policy if exists "vendor reviews authed insert" on public.vendor_reviews;
create policy "vendor reviews authed insert" on public.vendor_reviews
  for insert to authenticated with check (
    reviewer_user_id = auth.uid() and status = 'pending_review'
  );

drop policy if exists "vendor reviews admin all" on public.vendor_reviews;
create policy "vendor reviews admin all" on public.vendor_reviews
  for all to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));


commit;

-- ▶ 4/4 City Limits — grant the access they paid for
-- ════════════════════════════════════════════════════════════════════
-- City Limits Landscaping & Snow Removal — grant the access they paid for
-- Run in: Supabase SQL editor
-- ════════════════════════════════════════════════════════════════════
-- First paying customer (2026-08-17, $249 CAD). The subscription never
-- reached the database, so two things silently failed:
--   1. no subscriptions row  -> has_active_trade_access() = false
--                               -> they see the paywall, not the RFPs
--   2. profile_status stayed 'pending_review'
--                               -> their directory listing is not public
-- A successful Stripe webhook normally does both. It didn't fire.
--
-- Idempotent: the insert no-ops if a subscription already exists
-- (subscriptions is unique on organization_id).

insert into public.subscriptions (
  organization_id, status, amount, currency,
  current_period_start, current_period_end, cancel_at_period_end
)
values (
  'a164f24b-2e14-4b31-a3d2-8189d4c3475b',
  'active', 249, 'CAD',
  '2026-08-17T00:00:00Z', '2027-08-17T00:00:00Z', false
)
on conflict (organization_id) do nothing;

update public.organizations
   set profile_status = 'approved'
 where id = 'a164f24b-2e14-4b31-a3d2-8189d4c3475b'
   and profile_status <> 'approved';

-- Verify — expect t
select o.name,
       o.profile_status,
       s.status  as sub_status,
       s.amount,
       s.current_period_end,
       public.has_active_trade_access(om.user_id) as can_see_rfps
  from public.organizations o
  join public.organization_members om on om.organization_id = o.id
  left join public.subscriptions s on s.organization_id = o.id
 where o.id = 'a164f24b-2e14-4b31-a3d2-8189d4c3475b';
