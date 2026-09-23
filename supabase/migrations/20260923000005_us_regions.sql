-- United States: a national region plus one region per state (+ DC, PR).
--
-- PMRFP now imports U.S. federal building tenders (SAM.gov, /api/cron/us-tenders)
-- and accepts U.S. trades and property managers. Tenders are filed under their
-- state; trades pick "United States" (everything) or specific states — alert
-- matching includes every region under the one a trade picked.
--
-- Slugs are "us-<state>" so they never collide with Canadian city slugs
-- (Vancouver, London, Hamilton, Richmond Hill…). province stays NULL so the
-- regions index groups them under the country, not as 52 separate "provinces".
-- Idempotent.

-- The national region. Production already has it (seed script); fresh
-- databases didn't.
insert into public.regions (name, slug, province, country, parent_id, sort_order)
values ('United States', 'united-states', null, 'USA', null, 199)
on conflict (slug) do nothing;

insert into public.regions (name, slug, province, country, parent_id, sort_order)
select v.name, v.slug, null, 'USA', (select id from public.regions where slug = 'united-states'), v.so
from (values
  ('Alabama', 'us-alabama', 200),
  ('Alaska', 'us-alaska', 201),
  ('Arizona', 'us-arizona', 202),
  ('Arkansas', 'us-arkansas', 203),
  ('California', 'us-california', 204),
  ('Colorado', 'us-colorado', 205),
  ('Connecticut', 'us-connecticut', 206),
  ('Delaware', 'us-delaware', 207),
  ('District of Columbia', 'us-district-of-columbia', 208),
  ('Florida', 'us-florida', 209),
  ('Georgia', 'us-georgia', 210),
  ('Hawaii', 'us-hawaii', 211),
  ('Idaho', 'us-idaho', 212),
  ('Illinois', 'us-illinois', 213),
  ('Indiana', 'us-indiana', 214),
  ('Iowa', 'us-iowa', 215),
  ('Kansas', 'us-kansas', 216),
  ('Kentucky', 'us-kentucky', 217),
  ('Louisiana', 'us-louisiana', 218),
  ('Maine', 'us-maine', 219),
  ('Maryland', 'us-maryland', 220),
  ('Massachusetts', 'us-massachusetts', 221),
  ('Michigan', 'us-michigan', 222),
  ('Minnesota', 'us-minnesota', 223),
  ('Mississippi', 'us-mississippi', 224),
  ('Missouri', 'us-missouri', 225),
  ('Montana', 'us-montana', 226),
  ('Nebraska', 'us-nebraska', 227),
  ('Nevada', 'us-nevada', 228),
  ('New Hampshire', 'us-new-hampshire', 229),
  ('New Jersey', 'us-new-jersey', 230),
  ('New Mexico', 'us-new-mexico', 231),
  ('New York', 'us-new-york', 232),
  ('North Carolina', 'us-north-carolina', 233),
  ('North Dakota', 'us-north-dakota', 234),
  ('Ohio', 'us-ohio', 235),
  ('Oklahoma', 'us-oklahoma', 236),
  ('Oregon', 'us-oregon', 237),
  ('Pennsylvania', 'us-pennsylvania', 238),
  ('Puerto Rico', 'us-puerto-rico', 239),
  ('Rhode Island', 'us-rhode-island', 240),
  ('South Carolina', 'us-south-carolina', 241),
  ('South Dakota', 'us-south-dakota', 242),
  ('Tennessee', 'us-tennessee', 243),
  ('Texas', 'us-texas', 244),
  ('Utah', 'us-utah', 245),
  ('Vermont', 'us-vermont', 246),
  ('Virginia', 'us-virginia', 247),
  ('Washington', 'us-washington', 248),
  ('West Virginia', 'us-west-virginia', 249),
  ('Wisconsin', 'us-wisconsin', 250),
  ('Wyoming', 'us-wyoming', 251)
) as v(name, slug, so)
on conflict (slug) do nothing;

-- Verify: expect 52 states + the national region.
select count(*) filter (where slug like 'us-%') as states,
       count(*) filter (where slug = 'united-states') as national
  from public.regions
 where country = 'USA';
