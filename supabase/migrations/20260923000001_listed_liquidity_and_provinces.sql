-- ════════════════════════════════════════════════════════════════════
-- 1. Region supply views count LISTED companies, not paying ones
-- 2. Province-level regions for the rest of Canada
-- ════════════════════════════════════════════════════════════════════
-- Idempotent — safe to re-run.

-- ── 1. Liquidity = listed companies ─────────────────────────────────
-- These views are public (security definer, like rfp_public) and drive the
-- "founding region" states on the directory and region pages. Counting
-- PAYING orgs publicly revealed how many paying members PMRFP has per
-- region. Count approved, active, listed trade/supplier companies instead.
-- The column keeps its old name (CREATE OR REPLACE VIEW can't rename a
-- column and src/lib/data/liquidity.ts reads it) — it now means "listed".
create or replace view public.region_category_liquidity as
  select
    oreg.region_id,
    ocat.category_id,
    count(distinct o.id) as paid_org_count
  from public.organizations o
  join public.organization_regions oreg on oreg.organization_id = o.id
  join public.organization_categories ocat on ocat.organization_id = o.id
  where o.organization_type in ('trade_company','supplier')
    and o.status = 'active'
    and o.profile_status = 'approved'
    and coalesce(o.is_demo, false) = false
  group by oreg.region_id, ocat.category_id;

create or replace view public.region_liquidity as
  select
    oreg.region_id,
    count(distinct o.id) as paid_org_count
  from public.organizations o
  join public.organization_regions oreg on oreg.organization_id = o.id
  where o.organization_type in ('trade_company','supplier')
    and o.status = 'active'
    and o.profile_status = 'approved'
    and coalesce(o.is_demo, false) = false
  group by oreg.region_id;

comment on column public.region_liquidity.paid_org_count is
  'Listed (approved, active, non-demo) trade/supplier companies serving the region. Name kept for compatibility; no longer counts only paying members.';
comment on column public.region_category_liquidity.paid_org_count is
  'Listed (approved, active, non-demo) trade/supplier companies per region + category. Name kept for compatibility.';

-- ── 2. Provinces and territories ────────────────────────────────────
-- Public tenders arrive from every province; without a region they all
-- collapsed into "Canada". Ontario and Quebec already exist.
insert into public.regions (name, slug, province, parent_id, sort_order)
select v.name, v.slug, v.name, (select id from public.regions where slug = 'canada'), v.so
from (values
  ('British Columbia', 'british-columbia', 22),
  ('Alberta', 'alberta', 23),
  ('Saskatchewan', 'saskatchewan', 24),
  ('Manitoba', 'manitoba', 25),
  ('Nova Scotia', 'nova-scotia', 26),
  ('New Brunswick', 'new-brunswick', 27),
  ('Newfoundland and Labrador', 'newfoundland-and-labrador', 28),
  ('Prince Edward Island', 'prince-edward-island', 29),
  ('Yukon', 'yukon', 30),
  ('Northwest Territories', 'northwest-territories', 31),
  ('Nunavut', 'nunavut', 32)
) as v(name, slug, so)
on conflict (slug) do nothing;

-- File the existing western cities under their province.
update public.regions c
   set parent_id = p.id
  from public.regions p
 where (c.slug, p.slug) in (
         ('vancouver', 'british-columbia'),
         ('calgary', 'alberta'),
         ('edmonton', 'alberta'),
         ('winnipeg', 'manitoba')
       )
   and c.parent_id is distinct from p.id;

-- Verify
select slug, name from public.regions
 where slug in ('british-columbia','alberta','manitoba','nova-scotia','yukon')
 order by slug;
