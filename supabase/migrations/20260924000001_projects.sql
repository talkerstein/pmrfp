-- ════════════════════════════════════════════════════════════════════
-- Projects: photo-first case studies + reviews requested per project
-- ════════════════════════════════════════════════════════════════════
-- A trade snaps before/during/after photos on site, AI drafts the write-up,
-- and the project publishes as a case study. Then the trade asks the client
-- for a review of that exact project through a one-time emailed link.
--
-- Safe to re-run. The app ships BEFORE this runs: every read of the new
-- columns/tables catches the error and hides the new UI until it's applied.

-- ── 1. case_studies: photos + capture metadata ───────────────────────
-- photos: [{url, path, kind: before|during|after, width, height}]. URLs are
-- only ever written by our server (service role), and the app re-checks
-- every URL against the project-photos bucket prefix before rendering.
alter table public.case_studies
  add column if not exists photos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(photos) = 'array'),
  add column if not exists hero_url text,
  add column if not exists summary text,
  add column if not exists source text not null default 'form'
    check (source in ('form', 'capture')),
  add column if not exists client_approved boolean not null default false;

-- ── 2. review_invites: one-time "review this project" links ─────────
-- The raw token only ever exists in the email we send; we store its sha256
-- so an org member (who can read their own invites) can't pull the token
-- out of the API and write their own review.
create table if not exists public.review_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  case_study_id uuid not null references public.case_studies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_name text not null,
  client_email text not null,
  created_by_user_id uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists review_invites_case_study_idx on public.review_invites(case_study_id);
create index if not exists review_invites_org_idx on public.review_invites(organization_id, created_at desc);

alter table public.review_invites enable row level security;

-- Members see their own org's invites. Inserts/updates go through the
-- service role only (no insert/update policies on purpose).
drop policy if exists "review invites member read" on public.review_invites;
create policy "review invites member read" on public.review_invites
  for select to authenticated using (
    exists (select 1 from public.organization_members om
            where om.organization_id = review_invites.organization_id
              and om.user_id = auth.uid())
    or public.is_admin(auth.uid())
  );

-- ── 3. vendor_reviews: tie reviews to a project + consent flags ──────
alter table public.vendor_reviews
  add column if not exists case_study_id uuid references public.case_studies(id) on delete set null,
  add column if not exists reviewer_email text,
  add column if not exists verified_via text
    check (verified_via in ('project_invite', 'awarded_rfp', 'admin')),
  add column if not exists show_building boolean not null default false,
  -- Reviewer said the trade may list them as a reference (name, company, email).
  add column if not exists reference_ok boolean not null default false,
  add column if not exists reply text,
  add column if not exists reply_at timestamptz;
create index if not exists vendor_reviews_case_study_idx
  on public.vendor_reviews(case_study_id) where case_study_id is not null;

-- The base table holds the reviewer's email and (maybe unconsented)
-- company, so the public no longer reads it directly. Public pages read the
-- vendor_reviews_public view below instead. Admins keep full access through
-- "vendor reviews admin all".
drop policy if exists "vendor reviews public read published" on public.vendor_reviews;
-- Reviews now arrive only through a project invite link (server-side, service
-- role), so signed-in users can no longer insert reviews directly.
drop policy if exists "vendor reviews authed insert" on public.vendor_reviews;

-- Postgres-owned view (like rfp_public): published reviews only, safe
-- columns only. The company shows only with consent (show_building);
-- without it the name shortens to first name + last initial.
create or replace view public.vendor_reviews_public as
  select
    id,
    organization_id,
    case_study_id,
    case when show_building then btrim(reviewer_name)
         else regexp_replace(btrim(reviewer_name), '^(\S+)\s+(\S).*$', '\1 \2.')
    end as reviewer_display_name,
    case when show_building then reviewer_company end as reviewer_company,
    rating,
    body,
    verified_via,
    reply,
    reply_at,
    created_at
  from public.vendor_reviews
  where status = 'published';
grant select on public.vendor_reviews_public to anon, authenticated;

-- ── 4. Storage: public project-photos bucket ─────────────────────────
-- Uploads go through our server route with the service role (it strips
-- GPS/EXIF and resizes first), so there is NO client insert policy.
-- A public bucket serves files at /object/public/ without any policy; the
-- read policy only adds listing through the API. The SQL editor may lack
-- rights on storage.* ("must be owner of table objects"), so both steps
-- skip with a warning instead of aborting the rest of this file.
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('project-photos', 'project-photos', true)
  on conflict (id) do update set public = true;
exception when others then
  raise warning 'project-photos bucket not created (%). Create a PUBLIC bucket named project-photos in Storage.', sqlerrm;
end $$;

do $$
begin
  drop policy if exists "project-photos public read" on storage.objects;
  create policy "project-photos public read" on storage.objects
    for select to anon, authenticated using (bucket_id = 'project-photos');
exception when others then
  raise notice 'Skipped the project-photos read policy (%). Not needed: the bucket is public.', sqlerrm;
end $$;

-- ── Verify ────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'case_studies' and column_name in ('photos','hero_url','summary','source','client_approved');
-- select id, public from storage.buckets where id = 'project-photos';
-- select * from public.vendor_reviews_public limit 1;
