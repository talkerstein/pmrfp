-- ════════════════════════════════════════════════════════════════════
-- Portfolio upgrade: project visibility, case-study fields, private
-- share links, and projects attached to an expression of interest.
-- ════════════════════════════════════════════════════════════════════
-- A "project" and a "case study" are the same row in case_studies: a
-- project becomes a case study once the trade fills in the builder fields
-- (client type, scope, results). Visibility decides who can see it:
--   public    on the profile, the /projects gallery, search and the sitemap
--   unlisted  anyone with the link can open it; listed nowhere, noindex
--   private   members of the company only, plus whoever holds one of its
--             share links (resolved server-side with the service role)
--
-- Safe to re-run. The app ships BEFORE this runs: every read of the new
-- columns/tables catches the error and treats every project as public,
-- which is exactly what it was before.

-- ── 1. case_studies: visibility + case-study builder fields ──────────
alter table public.case_studies
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'unlisted', 'private')),
  -- Who the work was for (buyer type), never a client name.
  add column if not exists client_type text
    check (client_type in ('property_manager', 'condo_board', 'commercial_landlord', 'housing_provider',
                           'public_sector', 'general_contractor', 'business_owner', 'other')),
  add column if not exists scope text,
  -- Up to four figures the trade typed: [{value: "24,000 sq ft", label: "roof replaced"}].
  add column if not exists results jsonb not null default '[]'::jsonb
    check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 4),
  add column if not exists started_on date,
  add column if not exists completed_on date,
  -- The trade used "Tidy my wording" and confirmed the AI text before saving.
  add column if not exists ai_assisted boolean not null default false;

create index if not exists case_studies_public_idx
  on public.case_studies(published_at desc)
  where status = 'published' and visibility = 'public';

-- Public read: published AND public/unlisted. Private rows are readable by
-- the company's own members and admins only (share links go through the
-- service role after checking the token). Unlisted stays readable by slug
-- so the link works; the app keeps unlisted rows out of every list.
drop policy if exists "case studies public read published" on public.case_studies;
create policy "case studies public read published" on public.case_studies
  for select to anon, authenticated using (
    (status = 'published' and visibility in ('public', 'unlisted'))
    or exists (select 1 from public.organization_members om
               where om.organization_id = case_studies.organization_id
                 and om.user_id = auth.uid())
    or public.is_admin(auth.uid())
  );

-- Reviews tied to a private project stay off public pages: the public
-- view only shows reviews on public/unlisted projects or on no project.
create or replace view public.vendor_reviews_public as
  select
    r.id,
    r.organization_id,
    r.case_study_id,
    case when r.show_building then btrim(r.reviewer_name)
         else regexp_replace(btrim(r.reviewer_name), '^(\S+)\s+(\S).*$', '\1 \2.')
    end as reviewer_display_name,
    case when r.show_building then r.reviewer_company end as reviewer_company,
    r.rating,
    r.body,
    r.verified_via,
    r.reply,
    r.reply_at,
    r.created_at
  from public.vendor_reviews r
  left join public.case_studies cs on cs.id = r.case_study_id
  where r.status = 'published'
    and (r.case_study_id is null or cs.visibility is distinct from 'private');
grant select on public.vendor_reviews_public to anon, authenticated;

-- ── 2. Private share links ────────────────────────────────────────────
-- One row per link the company hands out (a bid, a prequalification
-- package). The token is shown to members so they can copy the link again;
-- nobody else can read this table. Inserts/updates go through the service
-- role only (no insert/update policies on purpose).
create table if not exists public.case_study_share_links (
  id uuid primary key default gen_random_uuid(),
  case_study_id uuid not null references public.case_studies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text unique not null check (token ~ '^[A-Za-z0-9_-]{32}$'),
  label text check (label is null or char_length(label) <= 80),
  created_by_user_id uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0
);
create index if not exists case_study_share_links_cs_idx on public.case_study_share_links(case_study_id);
create index if not exists case_study_share_links_org_idx on public.case_study_share_links(organization_id, created_at desc);

alter table public.case_study_share_links enable row level security;

drop policy if exists "share links member read" on public.case_study_share_links;
create policy "share links member read" on public.case_study_share_links
  for select to authenticated using (
    exists (select 1 from public.organization_members om
            where om.organization_id = case_study_share_links.organization_id
              and om.user_id = auth.uid())
    or public.is_admin(auth.uid())
  );

-- ── 3. Projects attached to an expression of interest ─────────────────
-- The trade picks up to three of its published projects when it says it's
-- interested in an RFP or GC package. The PM's page re-checks that each id
-- belongs to the interested company before showing anything.
alter table public.rfp_interests
  add column if not exists case_study_ids uuid[] not null default '{}'
    check (cardinality(case_study_ids) <= 3);

-- ── Verify ────────────────────────────────────────────────────────────
-- select visibility, count(*) from public.case_studies group by 1;
-- select count(*) from public.case_study_share_links;
-- select column_name from information_schema.columns
--   where table_name = 'rfp_interests' and column_name = 'case_study_ids';
