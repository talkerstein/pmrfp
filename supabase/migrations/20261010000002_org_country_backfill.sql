-- Country-first: organizations.country defaults to 'Canada' and the app never
-- set it, so U.S. companies were stored as Canadian. Sign-up and the company
-- profile now write it from the province/state; this backfills existing rows.
--
-- The app does not depend on this (lib/visitor-geo accountGeo reads the
-- province/state and the service regions first), but admin views, GHL sync and
-- any SQL report reading organizations.country become correct. Idempotent.

-- 1. A U.S. state (full name or two-letter code) in province → United States.
update public.organizations o
   set country = 'United States'
 where o.country is distinct from 'United States'
   and (
     o.province in (
       'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
       'District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas',
       'Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi',
       'Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York',
       'North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
       'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington',
       'West Virginia','Wisconsin','Wyoming','Puerto Rico'
     )
     or upper(o.province) in (
       'AL','AK','AZ','AR','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
       'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA',
       'RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR'
     )
   );

-- 2. No province, but every service region is in the U.S. → United States.
update public.organizations o
   set country = 'United States'
 where o.country is distinct from 'United States'
   and coalesce(o.province, '') = ''
   and exists (select 1 from public.organization_regions orr where orr.organization_id = o.id)
   and not exists (
     select 1
       from public.organization_regions orr
       join public.regions r on r.id = orr.region_id
      where orr.organization_id = o.id
        and r.country <> 'USA'
   );

-- Verify: U.S. companies after the backfill.
select count(*) as us_orgs from public.organizations where country = 'United States';
