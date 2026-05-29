-- ════════════════════════════════════════════════════════════════════
-- PMRFP — Reference data (Phase 2) · spec §11.4/11.5/11.8
-- Required taxonomy (categories, regions, property types). Idempotent.
-- This is NOT demo data — it ships to production.
-- ════════════════════════════════════════════════════════════════════

-- ── Trade categories (39) ───────────────────────────────────────────
insert into public.trade_categories (name, slug, icon, sort_order) values
  ('Electrical','electrical','Zap',10),
  ('Plumbing','plumbing','Droplets',20),
  ('HVAC','hvac','Wind',30),
  ('Roofing','roofing','Home',40),
  ('General Contracting','general-contracting','HardHat',50),
  ('Cleaning / Janitorial','cleaning-janitorial','SprayCan',60),
  ('Landscaping','landscaping','Trees',70),
  ('Snow Removal','snow-removal','Snowflake',80),
  ('Security Systems','security-systems','ShieldCheck',90),
  ('Fire Safety','fire-safety','Flame',100),
  ('Elevator Services','elevator-services','ArrowUpDown',110),
  ('Restoration','restoration','Wrench',120),
  ('Painting','painting','PaintRoller',130),
  ('Flooring','flooring','Grid3x3',140),
  ('Glass and Windows','glass-and-windows','AppWindow',150),
  ('Pest Control','pest-control','Bug',160),
  ('Locksmith','locksmith','Lock',170),
  ('Concrete and Asphalt','concrete-and-asphalt','Layers',180),
  ('Waste Removal','waste-removal','Trash2',190),
  ('Building Automation','building-automation','Cpu',200),
  ('Handyman / Maintenance','handyman-maintenance','Hammer',210),
  ('Garage Doors','garage-doors','DoorOpen',220),
  ('Waterproofing','waterproofing','Umbrella',230),
  ('Masonry','masonry','Blocks',240),
  ('Drywall','drywall','Square',250),
  ('Carpentry','carpentry','Ruler',260),
  ('Fencing','fencing','Fence',270),
  ('Property Maintenance','property-maintenance','Building2',280),
  ('Appliance Repair','appliance-repair','WashingMachine',290),
  ('Lighting','lighting','Lightbulb',300),
  ('Energy Efficiency','energy-efficiency','Leaf',310),
  ('EV Charging','ev-charging','PlugZap',320),
  ('Access Control','access-control','KeyRound',330),
  ('Cameras / Surveillance','cameras-surveillance','Camera',340),
  ('Parking Lot Maintenance','parking-lot-maintenance','Car',350),
  ('Signage','signage','Signpost',360),
  ('Millwork','millwork','Hammer',370),
  ('Demolition','demolition','Hammer',380),
  ('Environmental / Hazardous Materials','environmental-hazardous-materials','Biohazard',390)
on conflict (slug) do nothing;

-- ── Regions (22) — hierarchical ─────────────────────────────────────
insert into public.regions (name, slug, province, sort_order) values
  ('Canada','canada',null,10)
on conflict (slug) do nothing;

insert into public.regions (name, slug, province, parent_id, sort_order)
select 'Ontario','ontario','Ontario', (select id from public.regions where slug='canada'), 20
on conflict (slug) do nothing;

insert into public.regions (name, slug, province, parent_id, sort_order)
select 'Greater Toronto Area','greater-toronto-area','Ontario',(select id from public.regions where slug='ontario'),30
on conflict (slug) do nothing;

insert into public.regions (name, slug, province, parent_id, sort_order)
select v.name, v.slug, 'Ontario', (select id from public.regions where slug='greater-toronto-area'), v.so
from (values
  ('Toronto','toronto',40),
  ('North York','north-york',50),
  ('Vaughan','vaughan',60),
  ('Richmond Hill','richmond-hill',70),
  ('Markham','markham',80),
  ('Mississauga','mississauga',90),
  ('Brampton','brampton',100),
  ('Oakville','oakville',110),
  ('Burlington','burlington',120)
) as v(name,slug,so)
on conflict (slug) do nothing;

insert into public.regions (name, slug, province, parent_id, sort_order)
select v.name, v.slug, 'Ontario', (select id from public.regions where slug='ontario'), v.so
from (values
  ('Hamilton','hamilton',130),
  ('Kitchener-Waterloo','kitchener-waterloo',140),
  ('London','london',150),
  ('Ottawa','ottawa',160)
) as v(name,slug,so)
on conflict (slug) do nothing;

insert into public.regions (name, slug, province, parent_id, sort_order)
select v.name, v.slug, v.prov, (select id from public.regions where slug='canada'), v.so
from (values
  ('Montreal','montreal','Quebec',170),
  ('Calgary','calgary','Alberta',180),
  ('Edmonton','edmonton','Alberta',190),
  ('Vancouver','vancouver','British Columbia',200),
  ('Winnipeg','winnipeg','Manitoba',210)
) as v(name,slug,prov,so)
on conflict (slug) do nothing;

-- ── Property types (17) ─────────────────────────────────────────────
insert into public.property_types (name, slug) values
  ('Condominium','condominium'),
  ('Apartment Building','apartment-building'),
  ('Rental Residential','rental-residential'),
  ('Commercial Office','commercial-office'),
  ('Retail Plaza','retail-plaza'),
  ('Industrial Building','industrial-building'),
  ('Warehouse','warehouse'),
  ('Mixed-Use Property','mixed-use-property'),
  ('Institutional','institutional'),
  ('School','school'),
  ('Medical Building','medical-building'),
  ('Religious Facility','religious-facility'),
  ('Hotel','hotel'),
  ('Senior Living','senior-living'),
  ('Parking Structure','parking-structure'),
  ('Land Development','land-development'),
  ('Multi-Site Portfolio','multi-site-portfolio')
on conflict (slug) do nothing;
