-- Add Orbit Landscaping to the trade directory (requested 2026-09-24 by Rishon).
-- Source: orbitlandscaping.ca. Logo: public/logos/orbit-landscaping.png (their
-- brand mark, from the site's favicon.svg). The site lists no email, so the
-- public contact is the owner's phone.
-- Idempotent: re-running updates the same row and skips existing tags.

insert into public.organizations (
  name, slug, organization_type, website, phone, logo_url,
  city, province, country,
  short_description, full_description,
  emergency_service, verified, featured, is_demo,
  profile_status, public_contact_visibility, status
) values (
  'Orbit Landscaping',
  'orbit-landscaping',
  'trade_company',
  'https://orbitlandscaping.ca',
  '437-324-6505',
  '/logos/orbit-landscaping.png',
  'Toronto',
  'Ontario',
  'Canada',
  'Owner-operated landscaping and property care across the GTA: lawn care, seasonal cleanups, garden beds, sod and lawn repair, and winter snow and ice service. Residential and commercial.',
  'Orbit Landscaping is an owner-operated landscaping and property care company serving Toronto and York Region, from North York and Thornhill to Markham, Vaughan and Richmond Hill. The owner quotes, schedules and checks every job, so there is one accountable contact from the first call to the finished site. Services include recurring lawn cutting, garden maintenance, trimming and edging; seasonal spring and fall cleanups, mulch and bed renewal and shrub pruning; sod installation, seeding, lawn repair and aeration; and winter snow clearing, ice management and seasonal snow plans. Also available: planting, garden design, fencing and small exterior projects. For storefronts, offices, small commercial sites and managed properties, Orbit provides dependable exterior maintenance on a regular service schedule with clean, visitor-ready grounds.',
  false, false, false, false,
  'approved', 'show_contact', 'active'
)
on conflict (slug) do update set
  name = excluded.name,
  website = excluded.website,
  phone = excluded.phone,
  logo_url = excluded.logo_url,
  city = excluded.city,
  province = excluded.province,
  short_description = excluded.short_description,
  full_description = excluded.full_description,
  profile_status = excluded.profile_status,
  public_contact_visibility = excluded.public_contact_visibility,
  status = excluded.status;

-- Trades: landscaping (lawn, garden, cleanups, sod), snow removal (winter
-- snow and ice), fencing (fencing and small exterior projects).
insert into public.organization_categories (organization_id, category_id)
select o.id, c.id
  from public.organizations o, public.trade_categories c
 where o.slug = 'orbit-landscaping' and c.slug in ('landscaping', 'snow-removal', 'fencing')
on conflict do nothing;

-- Service area: GTA-wide = the GTA region plus all 9 cities under it.
insert into public.organization_regions (organization_id, region_id)
select o.id, r.id
  from public.organizations o, public.regions r
 where o.slug = 'orbit-landscaping'
   and r.slug in ('greater-toronto-area', 'toronto', 'north-york', 'vaughan', 'richmond-hill',
                  'markham', 'mississauga', 'brampton', 'oakville', 'burlington')
on conflict do nothing;

-- Property types: homes and rentals, plus small commercial and managed properties.
insert into public.organization_property_types (organization_id, property_type_id)
select o.id, p.id
  from public.organizations o, public.property_types p
 where o.slug = 'orbit-landscaping'
   and p.slug in ('townhome-complex', 'rental-residential', 'single-family-rental-portfolio', 'condominium',
                  'commercial-office', 'retail-plaza', 'mixed-use-property')
on conflict do nothing;
