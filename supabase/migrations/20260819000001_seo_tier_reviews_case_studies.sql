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
