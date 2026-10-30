-- Add Waterworks Plumbing & Drains to the trade directory (requested 2026-10-29 by Rishon;
-- Talkerstein client). Source: waterworkscanada.com.
-- Idempotent: re-running updates the same row and skips existing tags.
-- The logo ships in PR "listing: Waterworks Plumbing & Drains" (public/logos/waterworks-plumbing.png).
-- Run this BEFORE putting the "Find us on PMRFP" badge on their site.
-- Not set: email (the site doesn't publish one). Add it if they want it shown.

begin;

insert into public.organizations (
  name, slug, organization_type, website, phone, logo_url,
  address_line_1, city, province, postal_code, country,
  short_description, full_description,
  emergency_service, verified, featured, is_demo,
  profile_status, public_contact_visibility, status
) values (
  'Waterworks Plumbing & Drains',
  'waterworks-plumbing',
  'trade_company',
  'https://waterworkscanada.com',
  '416-489-0000',
  '/logos/waterworks-plumbing.png',
  '1212 The Queensway',
  'Etobicoke',
  'Ontario',
  'M8Z 1R8',
  'Canada',
  'Etobicoke plumbing and drain contractor. Drain cleaning and camera inspection, sewer line repair, backwater valves, sump pumps, water heaters and emergency plumbing across Toronto and the GTA.',
  'Waterworks Plumbing & Drains is an Etobicoke-based plumbing contractor serving Toronto and the surrounding GTA, holding a City of Toronto master plumbing licence, WSIB coverage and liability insurance, and BBB accreditation. Services include drain cleaning and camera inspection, sewer line repair, backwater valves, sump pumps with battery backup, basement flood protection, sewage backup, water heaters, lead water line and Kitec pipe replacement, leak repair and emergency plumbing. They also give second opinions on quotes.',
  true, false, false, false,
  'approved', 'show_contact', 'active'
)
on conflict (slug) do update set
  name = excluded.name,
  website = excluded.website,
  phone = excluded.phone,
  logo_url = excluded.logo_url,
  address_line_1 = excluded.address_line_1,
  city = excluded.city,
  province = excluded.province,
  postal_code = excluded.postal_code,
  short_description = excluded.short_description,
  full_description = excluded.full_description,
  emergency_service = excluded.emergency_service,
  profile_status = excluded.profile_status,
  public_contact_visibility = excluded.public_contact_visibility,
  status = excluded.status;

-- Trade: plumbing.
insert into public.organization_categories (organization_id, category_id)
select o.id, c.id
  from public.organizations o, public.trade_categories c
 where o.slug = 'waterworks-plumbing' and c.slug in ('plumbing')
on conflict do nothing;

-- Service area: Toronto and the GTA cities the site lists (Etobicoke sits under Toronto; Thornhill under Vaughan/Markham).
insert into public.organization_regions (organization_id, region_id)
select o.id, r.id
  from public.organizations o, public.regions r
 where o.slug = 'waterworks-plumbing'
   and r.slug in ('greater-toronto-area', 'toronto', 'north-york', 'mississauga', 'vaughan', 'richmond-hill')
on conflict do nothing;

-- Property types: their work is residential (homes and rental housing).
insert into public.organization_property_types (organization_id, property_type_id)
select o.id, p.id
  from public.organizations o, public.property_types p
 where o.slug = 'waterworks-plumbing'
   and p.slug in ('rental-residential', 'single-family-rental-portfolio')
on conflict do nothing;

commit;

-- Verify: expect 1 row, 1 trade, 6 regions, 2 property types.
select o.name, o.profile_status, o.emergency_service,
       (select count(*) from public.organization_categories x where x.organization_id = o.id) as trades,
       (select count(*) from public.organization_regions x where x.organization_id = o.id) as regions,
       (select count(*) from public.organization_property_types x where x.organization_id = o.id) as property_types
  from public.organizations o
 where o.slug = 'waterworks-plumbing';
