-- ════════════════════════════════════════════════════════════════════
-- PMRFP — Demo seed (runs on `supabase db reset`). All rows flagged
-- is_demo = true so production can exclude them. Safe to run repeatedly.
-- Sample trade companies + 5 sample RFPs (§21) + a few resources.
-- ════════════════════════════════════════════════════════════════════

-- ── Sample trade organizations ──────────────────────────────────────
insert into public.organizations
  (name, slug, organization_type, city, province, country, website, email, phone,
   short_description, full_description, years_in_business, employee_count_range,
   insurance_status, wsib_status, emergency_service, verified, featured, is_demo,
   profile_status, profile_completion_score, public_contact_visibility, status)
values
  ('Northline Electrical Ltd.','northline-electrical','trade_company','Toronto','Ontario','Canada',
   'https://example.com','contact@example.com','(416) 555-0142',
   'Commercial & condominium electrical maintenance and service upgrades across the GTA.',
   'Northline Electrical is a licensed electrical contractor serving commercial and multi-residential properties across the Greater Toronto Area. We handle preventive maintenance contracts, service upgrades, EV charger installs, and emergency call-outs.',
   18,'11-50','Fully insured ($5M liability)','Active','true','true','true','true',
   'approved',88,'request_intro','active'),
  ('Summit Mechanical (HVAC)','summit-mechanical-hvac','trade_company','North York','Ontario','Canada',
   'https://example.com','contact@example.com','(416) 555-0173',
   'HVAC preventive maintenance and mechanical services for apartment and office buildings.',
   'Summit Mechanical provides scheduled HVAC preventive maintenance, rooftop unit service, and mechanical retrofits for commercial and multi-residential portfolios.',
   12,'11-50','Fully insured','Active','true','true','false','true',
   'approved',82,'show_contact','active'),
  ('IronClad Roofing','ironclad-roofing','trade_company','Mississauga','Ontario','Canada',
   'https://example.com','contact@example.com','(905) 555-0118',
   'Flat-roof TPO, commercial re-roofs, and leak repair for plazas and warehouses.',
   'IronClad Roofing specializes in commercial flat-roof systems, preventive roof maintenance programs, and emergency leak response for retail and industrial properties.',
   22,'11-50','Fully insured','Active','true','true','false','true',
   'approved',79,'request_intro','active'),
  ('PureClean Facility Services','pureclean-facility','trade_company','Hamilton','Ontario','Canada',
   'https://example.com','contact@example.com','(905) 555-0190',
   'Janitorial and cleaning contracts for multi-residential and office properties.',
   'PureClean delivers daily janitorial, common-area cleaning, and post-construction cleanup for property managers across the Golden Horseshoe.',
   9,'51-200','Fully insured','Active','false','true','false','true',
   'approved',74,'request_intro','active'),
  ('GTA SnowPro','gta-snowpro','trade_company','Vaughan','Ontario','Canada',
   'https://example.com','contact@example.com','(905) 555-0155',
   'Commercial snow removal and de-icing for plazas, condos, and parking structures.',
   'GTA SnowPro runs dedicated seasonal snow and ice management contracts with 24/7 dispatch and salting for commercial properties.',
   14,'11-50','Fully insured','Active','true','false','false','true',
   'approved',71,'hide_contact','active'),
  ('Apex Asphalt & Concrete','apex-asphalt-concrete','trade_company','Brampton','Ontario','Canada',
   'https://example.com','contact@example.com','(905) 555-0166',
   'Parking lot asphalt repair, line painting, and concrete work for commercial sites.',
   'Apex provides asphalt repair, sealcoating, line painting, and concrete repairs for retail plazas, industrial yards, and parking structures.',
   16,'11-50','Fully insured','Active','false','false','false','true',
   'approved',68,'request_intro','active'),
  ('Guardian Fire & Safety','guardian-fire-safety','trade_company','Ottawa','Ontario','Canada',
   'https://example.com','contact@example.com','(613) 555-0144',
   'Fire alarm inspection, extinguisher service, and life-safety compliance.',
   'Guardian Fire & Safety handles annual fire-alarm verification, sprinkler inspection, and life-safety compliance for commercial and institutional buildings.',
   20,'11-50','Fully insured','Active','true','true','false','true',
   'approved',85,'show_contact','active'),
  ('Vista Glass & Windows','vista-glass-windows','trade_company','Markham','Ontario','Canada',
   'https://example.com','contact@example.com','(905) 555-0177',
   'Commercial glass replacement, storefront, and window repair.',
   'Vista Glass provides commercial storefront glazing, emergency board-up, and window replacement for offices and retail.',
   7,'1-10','Fully insured','Active','true','false','false','true',
   'approved',62,'request_intro','active'),
  -- ── Ported from the original pmrfp.com (legacy member companies) ──
  ('Toronto Painters','toronto-painters','trade_company','Toronto','Ontario','Canada',
   null,null,null,
   'Commercial & residential painting — interiors, common areas, and exterior repaints.',
   'Toronto Painters delivers interior and exterior painting for condominiums, apartments, offices, and retail spaces across the GTA, including common-area repaints and occupied-building scheduling.',
   12,'11-50','Fully insured','Active','false','true','false','true',
   'approved',70,'request_intro','active'),
  ('Northview Windows and Doors','northview-windows-doors','trade_company','Toronto','Ontario','Canada',
   null,null,null,
   'Window and door supply, replacement, and repair for residential & commercial buildings.',
   'Northview Windows and Doors handles window and door replacement, storefront glazing, and repairs for condominiums, apartments, and commercial properties across the Greater Toronto Area.',
   15,'11-50','Fully insured','Active','false','true','false','true',
   'approved',72,'request_intro','active')
-- A 'Maple Electric Supply' fixture was removed from this list: it was invented
-- (verified=true, "20 years", "Fully insured", WSIB "Active") but Maple Electric
-- Supply is a real Concord, ON distributor. The slug now belongs to the actual
-- company, seeded from its own published data by
-- scripts/seed-electrical-orgs.mjs. Fixture names must stay obviously fictional.
on conflict (slug) do nothing;

-- ── Link orgs → categories ──────────────────────────────────────────
insert into public.organization_categories (organization_id, category_id)
select o.id, c.id from public.organizations o join public.trade_categories c on true
where (o.slug,c.slug) in (
  ('northline-electrical','electrical'),('northline-electrical','lighting'),('northline-electrical','ev-charging'),
  ('summit-mechanical-hvac','hvac'),('summit-mechanical-hvac','building-automation'),
  ('ironclad-roofing','roofing'),('ironclad-roofing','waterproofing'),
  ('pureclean-facility','cleaning-janitorial'),('pureclean-facility','property-maintenance'),
  ('gta-snowpro','snow-removal'),('gta-snowpro','landscaping'),
  ('apex-asphalt-concrete','concrete-and-asphalt'),('apex-asphalt-concrete','parking-lot-maintenance'),
  ('guardian-fire-safety','fire-safety'),('guardian-fire-safety','security-systems'),
  ('vista-glass-windows','glass-and-windows'),
  ('toronto-painters','painting'),('toronto-painters','drywall'),
  ('northview-windows-doors','glass-and-windows'),('northview-windows-doors','garage-doors')
) on conflict do nothing;

-- ── Link orgs → regions ─────────────────────────────────────────────
insert into public.organization_regions (organization_id, region_id)
select o.id, r.id from public.organizations o join public.regions r on true
where (o.slug,r.slug) in (
  ('northline-electrical','toronto'),('northline-electrical','north-york'),('northline-electrical','greater-toronto-area'),
  ('summit-mechanical-hvac','north-york'),('summit-mechanical-hvac','toronto'),
  ('ironclad-roofing','mississauga'),('ironclad-roofing','greater-toronto-area'),
  ('pureclean-facility','hamilton'),('pureclean-facility','burlington'),
  ('gta-snowpro','vaughan'),('gta-snowpro','richmond-hill'),('gta-snowpro','markham'),
  ('apex-asphalt-concrete','brampton'),('apex-asphalt-concrete','mississauga'),
  ('guardian-fire-safety','ottawa'),
  ('vista-glass-windows','markham'),('vista-glass-windows','toronto')
) on conflict do nothing;

-- ── Link orgs → property types ──────────────────────────────────────
insert into public.organization_property_types (organization_id, property_type_id)
select o.id, p.id from public.organizations o join public.property_types p on true
where (o.slug,p.slug) in (
  ('northline-electrical','condominium'),('northline-electrical','commercial-office'),
  ('summit-mechanical-hvac','apartment-building'),('summit-mechanical-hvac','commercial-office'),
  ('ironclad-roofing','retail-plaza'),('ironclad-roofing','warehouse'),
  ('pureclean-facility','rental-residential'),('pureclean-facility','commercial-office'),
  ('gta-snowpro','retail-plaza'),('gta-snowpro','condominium'),
  ('apex-asphalt-concrete','retail-plaza'),('apex-asphalt-concrete','industrial-building'),
  ('guardian-fire-safety','institutional'),('guardian-fire-safety','commercial-office'),
  ('vista-glass-windows','commercial-office'),('vista-glass-windows','retail-plaza'),
  ('toronto-painters','condominium'),('toronto-painters','apartment-building'),('toronto-painters','commercial-office'),
  ('northview-windows-doors','condominium'),('northview-windows-doors','apartment-building'),('northview-windows-doors','commercial-office')
) on conflict do nothing;

-- ── 5 sample RFPs (§21) — published, admin-seeded, demo ─────────────
insert into public.rfp_posts
  (title, slug, summary, scope, requirements, property_type_id, city, province, region_id,
   budget_min, budget_max, budget_public, deadline, contact_visibility,
   source_type, status, is_demo, published_at)
values
  ('Condominium Electrical Maintenance Contract','condominium-electrical-maintenance-contract',
   'Annual preventive electrical maintenance for a 240-unit condominium tower in downtown Toronto.',
   'Scheduled quarterly inspection of common-area electrical systems, emergency lighting testing, panel servicing, and on-call response for a 240-unit high-rise condominium.',
   'Licensed electrical contractor (ECRA/ESA), $5M liability insurance, WSIB clearance, minimum 5 years commercial experience, references from condominium clients.',
   (select id from public.property_types where slug='condominium'),'Toronto','Ontario',
   (select id from public.regions where slug='toronto'),
   20000,40000,true,'2026-07-15','pmrfp_mediated','admin_seeded','published',true, now()),
  ('Commercial Plaza Snow Removal Services','commercial-plaza-snow-removal-services',
   'Seasonal snow removal and de-icing for a multi-tenant retail plaza in Mississauga.',
   'Full-season snow plowing, sidewalk clearing, and salting/de-icing for a 90,000 sq ft retail plaza with 24/7 trigger-based dispatch.',
   'Proof of insurance, dedicated equipment, 24/7 dispatch capability, salt supply, references for commercial snow contracts.',
   (select id from public.property_types where slug='retail-plaza'),'Mississauga','Ontario',
   (select id from public.regions where slug='mississauga'),
   null,null,false,'2026-09-30','pmrfp_mediated','admin_seeded','published',true, now()),
  ('Apartment Building HVAC Preventive Maintenance','apartment-building-hvac-preventive-maintenance',
   'Preventive HVAC maintenance program for a 3-building apartment portfolio in North York.',
   'Bi-annual HVAC servicing, rooftop unit maintenance, boiler inspection, and filter programs across three mid-rise apartment buildings.',
   'Licensed HVAC contractor (TSSA), liability insurance, WSIB, references for multi-residential portfolios.',
   (select id from public.property_types where slug='apartment-building'),'North York','Ontario',
   (select id from public.regions where slug='north-york'),
   15000,30000,false,'2026-08-01','public_contact','admin_seeded','published',true, now()),
  ('Retail Property Parking Lot Asphalt Repair','retail-property-parking-lot-asphalt-repair',
   'Asphalt repair and line painting for a retail property parking lot in Vaughan.',
   'Pothole repair, crack sealing, partial resurfacing, and re-striping of a 120-space retail parking lot.',
   'Insured asphalt contractor, equipment for hot-mix repair, traffic management plan, weekend work capability.',
   (select id from public.property_types where slug='retail-plaza'),'Vaughan','Ontario',
   (select id from public.regions where slug='vaughan'),
   25000,50000,true,'2026-07-31','anonymous_until_interest_approved','admin_seeded','published',true, now()),
  ('Multi-Residential Cleaning Services Contract','multi-residential-cleaning-services-contract',
   'Daily janitorial and common-area cleaning for a rental residential community in Hamilton.',
   'Daily common-area cleaning, garbage room management, and periodic deep-cleans across a 180-unit rental community.',
   'Insured janitorial company, WSIB, supervised staff, references for multi-residential cleaning.',
   (select id from public.property_types where slug='rental-residential'),'Hamilton','Ontario',
   (select id from public.regions where slug='hamilton'),
   null,null,false,'2026-08-20','pmrfp_mediated','admin_seeded','published',true, now()),
  -- ── Ported from the original pmrfp.com (legacy opportunities, refreshed) ──
  ('Exterior Wall Modification — Commercial Building','exterior-wall-modification-commercial',
   'Structural exterior wall modification and re-cladding for a commercial building in Québec.',
   'Modification of an existing exterior wall assembly including framing changes, cladding, weatherproofing, and restoration of the building envelope to current code.',
   'Licensed contractor (RBQ), liability insurance, CNESST registration, and experience with commercial building-envelope work.',
   (select id from public.property_types where slug='commercial-office'),'Montréal','Quebec',
   (select id from public.regions where slug='montreal'),
   null,null,false,'2026-08-10','pmrfp_mediated','admin_seeded','published',true, now()),
  ('Emergency Exit Extension & RBQ Compliance','emergency-exit-extension-rbq-compliance',
   'Emergency exit extension and code-compliance work to meet Québec RBQ standards.',
   'Construction of an extended emergency egress including framing, fire-rated assemblies, signage, and full compliance documentation to RBQ standards.',
   'RBQ licence, fire-code experience, liability insurance, CNESST, and references for life-safety compliance work.',
   (select id from public.property_types where slug='commercial-office'),'Québec City','Quebec',
   (select id from public.regions where slug='montreal'),
   null,null,false,'2026-07-28','pmrfp_mediated','admin_seeded','published',true, now()),
  ('Flooring, Paint & Ceiling Renovation','flooring-paint-ceiling-renovation',
   'Interior finishing — flooring, painting, and ceiling renovation for a Toronto residential property.',
   'Removal and replacement of flooring, a full repaint, and ceiling repair/replacement across a multi-unit interior renovation.',
   'Insured interior-finishing contractor, WSIB, dust-control plan, and references for occupied-building renovations.',
   (select id from public.property_types where slug='apartment-building'),'Toronto','Ontario',
   (select id from public.regions where slug='toronto'),
   null,null,false,'2026-08-05','pmrfp_mediated','admin_seeded','published',true, now()),
  ('HVAC System Replacement','hvac-system-replacement-montreal',
   'Full HVAC system replacement for a commercial property in Montréal.',
   'Removal of end-of-life HVAC equipment and supply/installation of new rooftop units, ductwork modifications, controls, and commissioning.',
   'Licensed HVAC contractor (RBQ/CMMTQ), liability insurance, CNESST, and references for commercial HVAC replacements.',
   (select id from public.property_types where slug='commercial-office'),'Montréal','Quebec',
   (select id from public.regions where slug='montreal'),
   40000,90000,true,'2026-09-05','public_contact','admin_seeded','published',true, now()),
  ('Kitchen & Bathroom Renovations','kitchen-bathroom-renovations',
   'Kitchen and bathroom renovations across units in a Toronto residential property.',
   'Multi-unit kitchen and bathroom renovations including cabinetry, plumbing fixtures, tiling, and finishing for a residential building.',
   'Insured general contractor, WSIB, plumbing sub-trade coordination, and references for multi-unit residential renovations.',
   (select id from public.property_types where slug='rental-residential'),'Toronto','Ontario',
   (select id from public.regions where slug='toronto'),
   null,null,false,'2026-08-18','pmrfp_mediated','admin_seeded','published',true, now()),
  ('Mold Remediation Specialist','mold-remediation-specialist',
   'Mold assessment and remediation for a residential building near Montréal (Boisbriand).',
   'Inspection, containment, removal, and remediation of mold-affected areas, with air-quality testing and clearance documentation.',
   'Certified mold-remediation specialist, environmental/hazmat protocols, liability insurance, CNESST, and clearance reporting.',
   (select id from public.property_types where slug='apartment-building'),'Boisbriand','Quebec',
   (select id from public.regions where slug='montreal'),
   null,null,false,'2026-07-22','anonymous_until_interest_approved','admin_seeded','published',true, now()),
  ('Electrical Service Contractor','electrical-service-contractor-gta',
   'Licensed electrician needed for service and repair work across a GTA property portfolio.',
   'On-call electrical service, repairs, fixture and panel work, and code corrections across a portfolio of commercial and residential properties.',
   'ECRA/ESA licensed electrician, liability insurance, WSIB, and availability for scheduled and emergency calls.',
   (select id from public.property_types where slug='multi-site-portfolio'),'Toronto','Ontario',
   (select id from public.regions where slug='greater-toronto-area'),
   null,null,false,'2026-07-20','pmrfp_mediated','admin_seeded','published',true, now())
on conflict (slug) do nothing;

-- ── Link RFPs → categories ──────────────────────────────────────────
insert into public.rfp_categories (rfp_id, category_id)
select r.id, c.id from public.rfp_posts r join public.trade_categories c on true
where (r.slug,c.slug) in (
  ('condominium-electrical-maintenance-contract','electrical'),
  ('commercial-plaza-snow-removal-services','snow-removal'),
  ('apartment-building-hvac-preventive-maintenance','hvac'),
  ('retail-property-parking-lot-asphalt-repair','concrete-and-asphalt'),
  ('multi-residential-cleaning-services-contract','cleaning-janitorial'),
  ('exterior-wall-modification-commercial','masonry'),
  ('emergency-exit-extension-rbq-compliance','general-contracting'),
  ('flooring-paint-ceiling-renovation','flooring'),
  ('hvac-system-replacement-montreal','hvac'),
  ('kitchen-bathroom-renovations','general-contracting'),
  ('mold-remediation-specialist','mold-remediation'),
  ('electrical-service-contractor-gta','electrical')
) on conflict do nothing;

-- ── Resources (published, demo) ─────────────────────────────────────
insert into public.resources (title, slug, excerpt, body, seo_title, meta_description, status, is_demo, published_at)
values
  ('How Commercial Property RFPs Work in Canada','how-commercial-property-rfps-work-in-canada',
   'A plain-English guide to how property managers issue RFPs and how trades can respond.',
   E'## How Commercial Property RFPs Work in Canada\n\nCommercial property work in Canada often moves through preferred-vendor lists, referrals, and fragmented RFP channels. This guide explains how property managers issue RFPs, what they look for, and how your company can position itself.\n\n### What is an RFP?\n\nA Request for Proposal (RFP) is how a property manager, builder, or owner formally invites vendors to bid on a project or service contract.\n\n### How to respond effectively\n\n- Read the scope carefully\n- Confirm insurance and licensing requirements\n- Submit a clear, complete capability statement\n\nPMRFP gives you a focused place to monitor these opportunities and express interest.',
   'How Commercial Property RFPs Work in Canada | PMRFP',
   'A plain-English guide to how Canadian property managers issue RFPs and how trade companies can respond and win more commercial work.',
   'published',true, now()),
  ('Vendor Prequalification Checklist','vendor-prequalification-checklist',
   'The documents and credentials property managers commonly require from vendors.',
   E'## Vendor Prequalification Checklist\n\nBefore you can win commercial property work, you usually need to prequalify. Here is what property managers commonly ask for:\n\n- Proof of liability insurance\n- WSIB clearance certificate\n- Trade licensing / certifications\n- References from similar properties\n- Capability statement\n- Health & safety policy\n\nKeep these ready so you can respond to opportunities fast.',
   'Vendor Prequalification Checklist for Commercial Property | PMRFP',
   'The documents and credentials Canadian property managers commonly require from trade vendors — get prequalified faster.',
   'published',true, now()),
  ('Snow Removal RFP Checklist','snow-removal-rfp-checklist',
   'What to include when bidding on a commercial snow removal contract.',
   E'## Snow Removal RFP Checklist\n\nBidding on a commercial snow removal contract? Make sure your proposal covers:\n\n- Trigger depth and response times\n- Equipment and salt supply\n- 24/7 dispatch\n- Insurance and slip-and-fall coverage\n- Site map and service zones\n\nA complete proposal stands out.',
   'Snow Removal RFP Checklist | PMRFP',
   'What to include when bidding on a commercial snow removal contract in Canada — a practical checklist for trades.',
   'published',true, now())
on conflict (slug) do nothing;
