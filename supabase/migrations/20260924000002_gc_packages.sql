-- ════════════════════════════════════════════════════════════════════
-- GC sub-trade packages
--
-- A general contractor bidding on (or holding) a job posts one package per
-- trade ("Roofing package — Etobicoke school renovation, quotes due Oct 10").
-- A package IS an rfp_posts row: same review/publish flow, same daily digest,
-- trade pages, Pro gating and express-interest. What's new:
--   • source_type 'gc_package' — so cards and pages can label it
--   • gc_project_name — the GC's project, shown publicly
--   • awarded_rfp_id — the public award notice the package belongs to, when
--     the GC came in from a contract they won
--
-- The app degrades gracefully until this runs: reads treat the new columns as
-- missing, and posting a package shows a "not available yet" message.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

alter table public.rfp_posts drop constraint if exists rfp_posts_source_type_check;
alter table public.rfp_posts add constraint rfp_posts_source_type_check
  check (source_type in ('property_manager_direct','admin_seeded','public_source','partner_referral','gc_package'));

alter table public.rfp_posts
  add column if not exists awarded_rfp_id uuid references public.rfp_posts(id) on delete set null;
alter table public.rfp_posts
  add column if not exists gc_project_name text;

create index if not exists rfp_posts_awarded_rfp_idx
  on public.rfp_posts(awarded_rfp_id) where awarded_rfp_id is not null;

-- Teaser view: same columns as before, plus the two package fields at the end
-- (create or replace view may only append columns). Both are public-safe: the
-- project name is what the GC chose to show, and the award is public record.
create or replace view public.rfp_public as
  select
    id, title, slug, summary,
    property_type_id, region_id, city, province,
    deadline, desired_start_date,
    source_type, is_demo, published_at, created_at,
    gc_project_name, awarded_rfp_id
  from public.rfp_posts
  where status = 'published';
grant select on public.rfp_public to anon, authenticated;

-- Verify: expect gc_project_name and awarded_rfp_id in the list.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'rfp_public'
  and column_name in ('gc_project_name','awarded_rfp_id');
