-- ════════════════════════════════════════════════════════════════════
-- PMRFP Marketplace: used / surplus construction equipment, tools,
-- materials, trailers, scaffolding. No payments between users and no
-- commission: buyers contact sellers through PMRFP (email relay, the
-- seller's address is never shown).
-- ════════════════════════════════════════════════════════════════════
-- * marketplace_listings: public reads active, unexpired listings. Owners
--   manage their own. Admins manage all.
-- * featured_until and views can only be changed by the server (service
--   role) or an admin; a trigger keeps owners from setting them. Owners
--   also can't bring back a listing an admin removed, or push expires_at
--   past 60 days from now.
-- * marketplace_messages: one row per buyer message (audit + abuse checks).
--   Server writes only; no policies, so anon/authenticated can't read it.
-- * Photos reuse the public project-photos bucket at {user_id}/{uuid}.jpg,
--   written only by /api/marketplace/photos (service role, EXIF stripped).
-- Safe to re-run.

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 120),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,90}$'),
  category text not null check (category in (
    'heavy-equipment','lifts','scaffolding','trailers','vehicles','power-tools','hand-tools',
    'generators','compressors','surveying','safety','materials','hvac','plumbing','electrical','other'
  )),
  condition text not null check (condition in ('new','like-new','used','for-parts')),
  price_cents integer check (price_cents is null or (price_cents >= 0 and price_cents <= 100000000)),
  currency text not null default 'CAD' check (currency in ('CAD','USD')),
  price_on_request boolean not null default false,
  description text not null check (char_length(description) between 20 and 5000),
  city text check (char_length(city) <= 80),
  region_slug text check (char_length(region_slug) <= 80),
  country text not null default 'CA' check (country in ('CA','US')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 10),
  status text not null default 'active' check (status in ('draft','active','sold','removed','expired')),
  featured_until timestamptz,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 days')
);

create index if not exists marketplace_listings_browse_idx
  on public.marketplace_listings(status, expires_at, featured_until desc, created_at desc);
create index if not exists marketplace_listings_user_idx on public.marketplace_listings(user_id, status);
create index if not exists marketplace_listings_category_idx on public.marketplace_listings(category, region_slug);

drop trigger if exists marketplace_listings_set_updated on public.marketplace_listings;
create trigger marketplace_listings_set_updated before update on public.marketplace_listings
  for each row execute function public.set_updated_at();

-- Guard the paid / server-owned columns from owners.
create or replace function public.marketplace_listings_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  privileged boolean := coalesce(auth.role(), '') = 'service_role' or public.is_admin(auth.uid());
begin
  if privileged then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.featured_until := null;
    new.views := 0;
    new.expires_at := now() + interval '60 days';
    if new.status not in ('draft','active') then
      new.status := 'active';
    end if;
    return new;
  end if;
  new.featured_until := old.featured_until;
  new.views := old.views;
  new.user_id := old.user_id;
  if old.status = 'removed' then
    raise exception 'This listing was removed by PMRFP.';
  end if;
  if new.status = 'removed' then
    new.status := old.status;
  end if;
  if new.expires_at > now() + interval '60 days' then
    new.expires_at := now() + interval '60 days';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_listings_guard on public.marketplace_listings;
create trigger marketplace_listings_guard before insert or update on public.marketplace_listings
  for each row execute function public.marketplace_listings_guard();

-- View counter, callable by anyone, touches only the views column.
create or replace function public.marketplace_increment_views(p_slug text)
returns void language sql security definer set search_path = public as $$
  update public.marketplace_listings set views = views + 1
  where slug = p_slug and status = 'active' and expires_at > now();
$$;
grant execute on function public.marketplace_increment_views(text) to anon, authenticated;

create table if not exists public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  sender_email text not null check (char_length(sender_email) <= 254),
  sender_name text not null check (char_length(sender_name) <= 120),
  body text not null check (char_length(body) between 10 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists marketplace_messages_listing_idx on public.marketplace_messages(listing_id, created_at desc);

-- RLS ─────────────────────────────────────────────────────────────────
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_messages enable row level security;

drop policy if exists "marketplace listings read" on public.marketplace_listings;
create policy "marketplace listings read" on public.marketplace_listings
  for select using (
    (status = 'active' and expires_at > now())
    or user_id = auth.uid()
    or public.is_admin(auth.uid())
  );

drop policy if exists "marketplace listings owner insert" on public.marketplace_listings;
create policy "marketplace listings owner insert" on public.marketplace_listings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "marketplace listings owner update" on public.marketplace_listings;
create policy "marketplace listings owner update" on public.marketplace_listings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "marketplace listings owner delete" on public.marketplace_listings;
create policy "marketplace listings owner delete" on public.marketplace_listings
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "marketplace listings admin all" on public.marketplace_listings;
create policy "marketplace listings admin all" on public.marketplace_listings
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- marketplace_messages: no policies on purpose (service role only).

-- Check after running:
-- select count(*) from public.marketplace_listings;
-- select proname from pg_proc where proname in ('marketplace_listings_guard','marketplace_increment_views');
