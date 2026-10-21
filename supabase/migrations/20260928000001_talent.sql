-- ════════════════════════════════════════════════════════════════════
-- PMRFP Talent: skilled tradespeople get a public profile employers can find
-- ════════════════════════════════════════════════════════════════════
-- * New self-serve role 'talent' ("Looking for work"). Added to the
--   primary_role check and to the sign-up whitelist in handle_new_user().
-- * talent_profiles: one per user. Public reads published profiles. No
--   email or phone lives here: contact goes through PMRFP (talent_contacts),
--   and the optional phone sits in talent_private (owner only).
-- * talent_endorsements: written only by the server for an approved company
--   that has worked with the person. Public read.
-- * talent_contacts: one row per employer message, used to enforce the
--   free monthly limit. Server writes only.
-- Safe to re-run.

-- 1. Role ──────────────────────────────────────────────────────────────
alter table public.users_profile drop constraint if exists users_profile_primary_role_check;
alter table public.users_profile add constraint users_profile_primary_role_check
  check (primary_role in ('trade','property_manager','admin','super_admin','visitor','supplier','real_estate_agent','talent'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested text := nullif(new.raw_user_meta_data->>'primary_role', '');
begin
  insert into public.users_profile (id, email, full_name, primary_role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when requested in ('trade', 'property_manager', 'supplier', 'real_estate_agent', 'visitor', 'talent') then requested
      else 'trade'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Profiles ──────────────────────────────────────────────────────────
create table if not exists public.talent_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  headline text check (char_length(headline) <= 140),
  primary_trade_id uuid references public.trade_categories(id) on delete set null,
  other_trade_ids uuid[] not null default '{}',
  region_id uuid references public.regions(id) on delete set null,
  city text check (char_length(city) <= 80),
  years_experience integer check (years_experience between 0 and 60),
  certifications text[] not null default '{}' check (cardinality(certifications) <= 30),
  availability text not null default 'open_to_offers'
    check (availability in ('available_now', 'open_to_offers', 'not_looking')),
  employment_types text[] not null default '{}'
    check (employment_types <@ array['full_time','part_time','contract','seasonal','apprenticeship','temporary']::text[]),
  pay_expectation text check (char_length(pay_expectation) <= 80),
  bio text check (char_length(bio) <= 3000),
  published boolean not null default true,
  contact_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists talent_profiles_browse_idx on public.talent_profiles(published, availability);
create index if not exists talent_profiles_trade_idx on public.talent_profiles(primary_trade_id);

drop trigger if exists talent_profiles_set_updated on public.talent_profiles;
create trigger talent_profiles_set_updated before update on public.talent_profiles
  for each row execute function public.set_updated_at();

-- Phone number, if they choose to share it. Owner only; the server shows it
-- to employers when contact_visible is on.
create table if not exists public.talent_private (
  user_id uuid primary key references public.talent_profiles(user_id) on delete cascade,
  phone text check (char_length(phone) <= 30),
  updated_at timestamptz not null default now()
);

-- 3. Endorsements ──────────────────────────────────────────────────────
create table if not exists public.talent_endorsements (
  id uuid primary key default gen_random_uuid(),
  talent_user_id uuid not null references public.talent_profiles(user_id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endorsed_by uuid references public.users_profile(id) on delete set null,
  note text not null check (char_length(note) between 10 and 600),
  created_at timestamptz not null default now(),
  unique (talent_user_id, organization_id)
);
create index if not exists talent_endorsements_talent_idx on public.talent_endorsements(talent_user_id, created_at desc);

-- 4. Employer contacts (for the monthly limit) ─────────────────────────
create table if not exists public.talent_contacts (
  id uuid primary key default gen_random_uuid(),
  talent_user_id uuid not null references public.talent_profiles(user_id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_id uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists talent_contacts_org_idx on public.talent_contacts(organization_id, created_at desc);

-- 5. RLS ───────────────────────────────────────────────────────────────
alter table public.talent_profiles enable row level security;
alter table public.talent_private enable row level security;
alter table public.talent_endorsements enable row level security;
alter table public.talent_contacts enable row level security;

drop policy if exists "talent profiles read" on public.talent_profiles;
create policy "talent profiles read" on public.talent_profiles
  for select using (published or user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "talent profiles owner insert" on public.talent_profiles;
create policy "talent profiles owner insert" on public.talent_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "talent profiles owner update" on public.talent_profiles;
create policy "talent profiles owner update" on public.talent_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "talent profiles owner delete" on public.talent_profiles;
create policy "talent profiles owner delete" on public.talent_profiles
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "talent private owner" on public.talent_private;
create policy "talent private owner" on public.talent_private
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Endorsements show on published profiles (and to the person themselves).
drop policy if exists "talent endorsements read" on public.talent_endorsements;
create policy "talent endorsements read" on public.talent_endorsements
  for select using (
    exists (
      select 1 from public.talent_profiles t
      where t.user_id = talent_endorsements.talent_user_id and (t.published or t.user_id = auth.uid())
    )
    or public.is_admin(auth.uid())
  );

-- Contacts: the sending company sees its own; nobody writes directly.
drop policy if exists "talent contacts org read" on public.talent_contacts;
create policy "talent contacts org read" on public.talent_contacts
  for select to authenticated using (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  );

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.talent_contacts to service_role;
grant select, insert, update, delete on public.talent_endorsements to service_role;
grant select, insert, update, delete on public.talent_private to service_role;
grant select, insert, update, delete on public.talent_profiles to service_role;
grant select on public.talent_profiles to anon, authenticated;
grant insert on public.talent_profiles to authenticated;
grant update on public.talent_profiles to authenticated;
grant delete on public.talent_profiles to authenticated;
grant select, insert, update, delete on public.talent_private to authenticated;
grant select on public.talent_endorsements to anon, authenticated;
grant select on public.talent_contacts to authenticated;
