-- Add Smart Choice Windows & Doors to the trade directory (requested 2026-09-24 by Rishon).
-- Source: smartchoicewindows.ca. Logo: public/logos/smart-choice-windows-and-doors.png
-- (the window mark from their logo, cropped square for the directory tile).
-- Idempotent: re-running updates the same row and skips existing tags.

insert into public.organizations (
  name, slug, organization_type, website, phone, email, logo_url,
  address_line_1, city, province, postal_code, country,
  short_description, full_description,
  emergency_service, verified, featured, is_demo,
  profile_status, public_contact_visibility, status
) values (
  'Smart Choice Windows & Doors',
  'smart-choice-windows-and-doors',
  'trade_company',
  'https://smartchoicewindows.ca',
  '416-629-2446',
  'info@smartchoicewindows.ca',
  '/logos/smart-choice-windows-and-doors.png',
  '401 Magnetic Dr., Unit 27',
  'Toronto',
  'Ontario',
  'M3J 3H9',
  'Canada',
  'Custom and replacement windows and doors across the GTA, supplied and professionally installed: casement, awning, sliding, tilt-and-turn and picture windows, patio and entry doors.',
  'Smart Choice Windows & Doors is a locally owned window and door company based in North York, supplying and installing custom and replacement windows and doors across the Greater Toronto Area. Windows include awning, casement, sliding, hung, picture, bay and bow, shaped and European tilt-and-turn, in a wide range of styles, colours, glass and hardware. Doors include patio sliding and bi-folding doors, lift-and-slide systems, and steel and fiberglass entry doors. Energy-efficient products come with a transferable lifetime manufacturer''s warranty, a dedicated project manager runs each job from start to finish, and financing is available. They also supply commercial vinyl windows and sliding doors for multi-unit projects. Toll-free: 1-855-690-7171.',
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

-- Trade: windows and doors (glass-and-windows).
insert into public.organization_categories (organization_id, category_id)
select o.id, c.id
  from public.organizations o, public.trade_categories c
 where o.slug = 'smart-choice-windows-and-doors' and c.slug in ('glass-and-windows')
on conflict do nothing;

-- Service area: GTA-wide = the GTA region plus all 9 cities under it.
insert into public.organization_regions (organization_id, region_id)
select o.id, r.id
  from public.organizations o, public.regions r
 where o.slug = 'smart-choice-windows-and-doors'
   and r.slug in ('greater-toronto-area', 'toronto', 'north-york', 'vaughan', 'richmond-hill',
                  'markham', 'mississauga', 'brampton', 'oakville', 'burlington')
on conflict do nothing;

-- Property types: homes, rentals and multi-unit residential, plus commercial.
insert into public.organization_property_types (organization_id, property_type_id)
select o.id, p.id
  from public.organizations o, public.property_types p
 where o.slug = 'smart-choice-windows-and-doors'
   and p.slug in ('condominium', 'apartment-building', 'purpose-built-rental', 'townhome-complex',
                  'rental-residential', 'single-family-rental-portfolio',
                  'commercial-office', 'mixed-use-property', 'retail-plaza')
on conflict do nothing;
