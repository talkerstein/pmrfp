-- Add Brickstone Construction to the trade directory (requested 2026-11-25 by Rishon).
-- Source: www.brickstone-construction.com, read 2026-11-25. Logo: public/logos/brickstone-construction.png
-- (already on master since PR #96, 2026-09-30).
--
-- Why now: PR #96 shipped the logo only. The row itself was pasted SQL that never ran, so
-- /directory/brickstone-construction returned 404 while Brickstone's own site footer links to it.
--
-- File date: written 2026-11-25 but numbered 20261101000450 on purpose. It sorts after the last
-- applied migration (20261101000400) and before the migrations waiting in open pull requests
-- (20261101000500 and later), so merging this first does not make those "earlier" files.
--
-- Nothing here is checked by PMRFP: verified stays false, and the WSIB line is the company's own
-- statement. The followed-link and indexing fields are left to the daily link-signals sync.
-- Idempotent: re-running updates the same row and skips existing tags.

insert into public.organizations (
  name, slug, organization_type, website, phone, email, logo_url,
  address_line_1, city, province, postal_code, country,
  short_description, full_description,
  emergency_service, verified, featured, is_demo,
  profile_status, public_contact_visibility, status
) values (
  'Brickstone Construction',
  'brickstone-construction',
  'trade_company',
  'https://www.brickstone-construction.com',
  '416-879-7781',
  'info@brickstone-construction.com',
  '/logos/brickstone-construction.png',
  '358 Flint Road',
  'Toronto',
  'Ontario',
  'M3J 2J4',
  'Canada',
  'Building restoration contractor serving Toronto and the GTA since 2005: balcony repair, parking garage rehabilitation, concrete restoration and waterproofing for high-rise, commercial and industrial buildings.',
  'Brickstone Construction Limited is a restoration and renovation contractor based in North York, working on high-rise apartments, commercial office and retail, and industrial properties across the Greater Toronto Area since 2005. Its ten services are concrete and asphalt works, underground and above-ground parking garage rehabilitation, balcony repair and upgrades, full exterior and interior waterproofing, complete residential and commercial restoration, flooring upgrades, exterior metal works (railings, guards, handrails and gates), fencing, gates and frameworks, carpentry and painting, and granite, marble and tile. Work is phased so buildings and garages stay open to residents and tenants. Every job starts with a free, no-obligation site assessment, followed by a written scope, schedule and price for owners and boards. Brickstone states that its workers are covered by WSIB on every job, with clearance available on request. Service area: Toronto (downtown, North York, Etobicoke and Scarborough), Mississauga, Brampton, Vaughan, Markham, Richmond Hill, Hamilton, Oshawa and Barrie.',
  false, false, false, false,
  'approved', 'show_contact', 'active'
)
on conflict (slug) do update set
  name = excluded.name,
  website = excluded.website,
  phone = excluded.phone,
  email = excluded.email,
  logo_url = excluded.logo_url,
  address_line_1 = excluded.address_line_1,
  city = excluded.city,
  province = excluded.province,
  postal_code = excluded.postal_code,
  short_description = excluded.short_description,
  full_description = excluded.full_description,
  profile_status = excluded.profile_status,
  public_contact_visibility = excluded.public_contact_visibility,
  status = excluded.status;

-- Trades: only what their services page lists. Garage rehabilitation, asphalt patching and line
-- painting sit under parking-lot-maintenance. No masonry tag: the site does not name it.
insert into public.organization_categories (organization_id, category_id)
select o.id, c.id
  from public.organizations o, public.trade_categories c
 where o.slug = 'brickstone-construction'
   and c.slug in ('restoration', 'concrete-and-asphalt', 'waterproofing', 'parking-lot-maintenance',
                  'flooring', 'fencing', 'carpentry', 'painting')
on conflict do nothing;

-- Service area: "Toronto & GTA" = the GTA region plus the 9 cities under it, plus Hamilton.
-- Oshawa and Barrie are named in the description; they have no region row yet.
insert into public.organization_regions (organization_id, region_id)
select o.id, r.id
  from public.organizations o, public.regions r
 where o.slug = 'brickstone-construction'
   and r.slug in ('greater-toronto-area', 'toronto', 'north-york', 'vaughan', 'richmond-hill',
                  'markham', 'mississauga', 'brampton', 'oakville', 'burlington', 'hamilton')
on conflict do nothing;

-- Property types: high-rise residential, commercial office and retail, industrial, parking structures.
insert into public.organization_property_types (organization_id, property_type_id)
select o.id, p.id
  from public.organizations o, public.property_types p
 where o.slug = 'brickstone-construction'
   and p.slug in ('condominium', 'apartment-building', 'purpose-built-rental', 'commercial-office',
                  'retail-plaza', 'industrial-building', 'mixed-use-property', 'parking-structure')
on conflict do nothing;
