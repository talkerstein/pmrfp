-- ════════════════════════════════════════════════════════════════════
-- PMRFP — Schema (Phase 2)
-- All tables, enums (as CHECK constraints), indexes, helper functions,
-- and triggers per the product spec §11.
-- RLS policies live in 20260529000002_rls.sql; storage in ..._storage.sql.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pg_trgm;       -- trigram search

-- ── Shared helpers ──────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 11.1 users_profile
-- ════════════════════════════════════════════════════════════════════
create table public.users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  primary_role text not null default 'trade'
    check (primary_role in ('trade','property_manager','admin','super_admin','visitor')),
  onboarding_completed boolean not null default false,
  status text not null default 'active'
    check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index users_profile_role_idx on public.users_profile(primary_role);
create index users_profile_status_idx on public.users_profile(status);
create trigger users_profile_set_updated before update on public.users_profile
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users_profile (id, email, full_name, primary_role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'primary_role',''), 'trade')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════
-- 11.2 organizations
-- ════════════════════════════════════════════════════════════════════
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  organization_type text not null default 'trade_company'
    check (organization_type in ('trade_company','property_manager','builder','owner','admin')),
  website text,
  phone text,
  email text,
  logo_url text,
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  postal_code text,
  country text not null default 'Canada',
  short_description text,
  full_description text,
  years_in_business integer,
  employee_count_range text,
  insurance_status text,
  wsib_status text,
  emergency_service boolean not null default false,
  verified boolean not null default false,
  featured boolean not null default false,
  is_demo boolean not null default false,
  profile_status text not null default 'draft'
    check (profile_status in ('draft','pending_review','approved','rejected','suspended')),
  profile_completion_score integer not null default 0,
  public_contact_visibility text not null default 'request_intro'
    check (public_contact_visibility in ('show_contact','request_intro','hide_contact')),
  status text not null default 'active'
    check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_type_idx on public.organizations(organization_type);
create index organizations_profile_status_idx on public.organizations(profile_status);
create index organizations_verified_idx on public.organizations(verified);
create index organizations_featured_idx on public.organizations(featured);
create index organizations_status_idx on public.organizations(status);
create index organizations_name_trgm on public.organizations using gin (name gin_trgm_ops);
create index organizations_desc_trgm on public.organizations using gin (short_description gin_trgm_ops);
create trigger organizations_set_updated before update on public.organizations
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 11.3 organization_members
-- ════════════════════════════════════════════════════════════════════
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index org_members_org_idx on public.organization_members(organization_id);
create index org_members_user_idx on public.organization_members(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 11.4 trade_categories
-- ════════════════════════════════════════════════════════════════════
create table public.trade_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  parent_id uuid references public.trade_categories(id) on delete set null,
  description text,
  icon text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index trade_categories_active_idx on public.trade_categories(active);

-- ════════════════════════════════════════════════════════════════════
-- 11.5 regions
-- ════════════════════════════════════════════════════════════════════
create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  province text,
  country text not null default 'Canada',
  parent_id uuid references public.regions(id) on delete set null,
  active boolean not null default true,
  sort_order integer not null default 0
);
create index regions_active_idx on public.regions(active);

-- ════════════════════════════════════════════════════════════════════
-- 11.8 property_types
-- ════════════════════════════════════════════════════════════════════
create table public.property_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  active boolean not null default true
);

-- ════════════════════════════════════════════════════════════════════
-- 11.6 / 11.7 / 11.9 organization ↔ taxonomy joins
-- ════════════════════════════════════════════════════════════════════
create table public.organization_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references public.trade_categories(id) on delete cascade,
  unique (organization_id, category_id)
);
create index org_categories_org_idx on public.organization_categories(organization_id);
create index org_categories_cat_idx on public.organization_categories(category_id);

create table public.organization_regions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  unique (organization_id, region_id)
);
create index org_regions_org_idx on public.organization_regions(organization_id);
create index org_regions_region_idx on public.organization_regions(region_id);

create table public.organization_property_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_type_id uuid not null references public.property_types(id) on delete cascade,
  unique (organization_id, property_type_id)
);
create index org_proptypes_org_idx on public.organization_property_types(organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 11.10 rfp_posts
-- ════════════════════════════════════════════════════════════════════
create table public.rfp_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  summary text,
  scope text,
  requirements text,
  property_type_id uuid references public.property_types(id) on delete set null,
  city text,
  province text,
  region_id uuid references public.regions(id) on delete set null,
  exact_address text,
  show_exact_address boolean not null default false,
  budget_min numeric,
  budget_max numeric,
  budget_public boolean not null default false,
  desired_start_date date,
  deadline date,
  site_visit_date timestamptz,
  submission_instructions text,
  contact_name text,
  contact_email text,
  contact_phone text,
  contact_visibility text not null default 'pmrfp_mediated'
    check (contact_visibility in ('public_contact','pmrfp_mediated','anonymous_until_interest_approved')),
  posted_by_user_id uuid references public.users_profile(id) on delete set null,
  posted_by_organization_id uuid references public.organizations(id) on delete set null,
  source_type text not null default 'property_manager_direct'
    check (source_type in ('property_manager_direct','admin_seeded','public_source','partner_referral')),
  source_url text,
  source_notes text,
  status text not null default 'draft'
    check (status in ('draft','pending_review','published','closed','awarded','archived','rejected')),
  is_demo boolean not null default false,
  published_at timestamptz,
  closed_at timestamptz,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rfp_posts_status_idx on public.rfp_posts(status);
create index rfp_posts_deadline_idx on public.rfp_posts(deadline);
create index rfp_posts_region_idx on public.rfp_posts(region_id);
create index rfp_posts_proptype_idx on public.rfp_posts(property_type_id);
create index rfp_posts_posted_org_idx on public.rfp_posts(posted_by_organization_id);
create index rfp_posts_posted_user_idx on public.rfp_posts(posted_by_user_id);
create index rfp_posts_title_trgm on public.rfp_posts using gin (title gin_trgm_ops);
create index rfp_posts_summary_trgm on public.rfp_posts using gin (summary gin_trgm_ops);
create trigger rfp_posts_set_updated before update on public.rfp_posts
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 11.11 rfp_categories
-- ════════════════════════════════════════════════════════════════════
create table public.rfp_categories (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts(id) on delete cascade,
  category_id uuid not null references public.trade_categories(id) on delete cascade,
  unique (rfp_id, category_id)
);
create index rfp_categories_rfp_idx on public.rfp_categories(rfp_id);
create index rfp_categories_cat_idx on public.rfp_categories(category_id);

-- ════════════════════════════════════════════════════════════════════
-- 11.12 rfp_documents
-- ════════════════════════════════════════════════════════════════════
create table public.rfp_documents (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts(id) on delete cascade,
  file_url text,
  file_path text,
  file_name text,
  file_type text,
  file_size integer,
  visibility text not null default 'paid_users'
    check (visibility in ('public','paid_users','admin_only')),
  created_at timestamptz not null default now()
);
create index rfp_documents_rfp_idx on public.rfp_documents(rfp_id);

-- ════════════════════════════════════════════════════════════════════
-- 11.13 saved_rfps
-- ════════════════════════════════════════════════════════════════════
create table public.saved_rfps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  rfp_id uuid not null references public.rfp_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, rfp_id)
);
create index saved_rfps_user_idx on public.saved_rfps(user_id);
create index saved_rfps_rfp_idx on public.saved_rfps(rfp_id);

-- ════════════════════════════════════════════════════════════════════
-- 11.14 rfp_interests
-- ════════════════════════════════════════════════════════════════════
create table public.rfp_interests (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts(id) on delete cascade,
  trade_organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by_user_id uuid references public.users_profile(id) on delete set null,
  message text,
  relevant_experience text,
  availability text,
  attachment_url text,
  status text not null default 'submitted'
    check (status in ('submitted','viewed','contact_revealed','shortlisted','declined','closed')),
  contact_revealed boolean not null default false,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rfp_id, trade_organization_id)
);
create index rfp_interests_rfp_idx on public.rfp_interests(rfp_id);
create index rfp_interests_org_idx on public.rfp_interests(trade_organization_id);
create trigger rfp_interests_set_updated before update on public.rfp_interests
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 11.15 contact_requests
-- ════════════════════════════════════════════════════════════════════
create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null default 'general_contact'
    check (request_type in ('directory_intro','property_manager_help','general_contact','vendor_question')),
  requester_name text,
  requester_email text,
  requester_phone text,
  requester_organization text,
  target_organization_id uuid references public.organizations(id) on delete set null,
  message text,
  status text not null default 'new'
    check (status in ('new','contacted','closed','spam')),
  created_at timestamptz not null default now()
);
create index contact_requests_status_idx on public.contact_requests(status);
create index contact_requests_target_idx on public.contact_requests(target_organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 11.16 subscriptions
-- ════════════════════════════════════════════════════════════════════
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users_profile(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text not null default 'inactive'
    check (status in ('trialing','active','past_due','canceled','unpaid','comped','inactive')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  amount numeric,
  currency text not null default 'CAD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);
create index subscriptions_org_idx on public.subscriptions(organization_id);
create index subscriptions_stripe_sub_idx on public.subscriptions(stripe_subscription_id);
create index subscriptions_status_idx on public.subscriptions(status);
create trigger subscriptions_set_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 11.17 profile_views / 11.18 rfp_views
-- ════════════════════════════════════════════════════════════════════
create table public.profile_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  viewed_by_user_id uuid references public.users_profile(id) on delete set null,
  viewer_ip_hash text,
  referrer text,
  created_at timestamptz not null default now()
);
create index profile_views_org_idx on public.profile_views(organization_id);

create table public.rfp_views (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts(id) on delete cascade,
  viewed_by_user_id uuid references public.users_profile(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  viewer_ip_hash text,
  created_at timestamptz not null default now()
);
create index rfp_views_rfp_idx on public.rfp_views(rfp_id);

-- ════════════════════════════════════════════════════════════════════
-- 11.19 resources
-- ════════════════════════════════════════════════════════════════════
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  excerpt text,
  body text,
  seo_title text,
  meta_description text,
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  is_demo boolean not null default false,
  published_at timestamptz,
  author_user_id uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resources_status_idx on public.resources(status);
create trigger resources_set_updated before update on public.resources
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 11.20 notifications
-- ════════════════════════════════════════════════════════════════════
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  type text,
  title text,
  message text,
  link_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 11.21 audit_logs
-- ════════════════════════════════════════════════════════════════════
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users_profile(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs(actor_user_id);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

-- ════════════════════════════════════════════════════════════════════
-- platform_settings (single-row config for admin §10.5)
-- ════════════════════════════════════════════════════════════════════
create table public.platform_settings (
  id boolean primary key default true check (id),  -- enforces a single row
  site_name text not null default 'PMRFP',
  pricing_amount numeric not null default 249,
  stripe_price_id text,
  default_disclaimer text,
  admin_notification_email text default 'admin@pmrfp.com',
  support_email text default 'support@pmrfp.com',
  featured_categories jsonb default '[]'::jsonb,
  homepage_stats jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger platform_settings_set_updated before update on public.platform_settings
  for each row execute function public.set_updated_at();
insert into public.platform_settings (id) values (true) on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════
-- Role helpers used by RLS
-- ════════════════════════════════════════════════════════════════════

-- True when the user belongs to a non-suspended trade org with an active/comped sub.
create or replace function public.has_active_trade_access(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    join public.subscriptions s on s.organization_id = o.id
    where om.user_id = uid
      and o.organization_type = 'trade_company'
      and o.status <> 'suspended'
      and s.status in ('active','comped')
  );
$$;

-- True when the user is an admin or super_admin (and active).
create or replace function public.is_admin(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users_profile p
    where p.id = uid
      and p.primary_role in ('admin','super_admin')
      and p.status = 'active'
  );
$$;

-- True when the user is a member of the given organization.
create or replace function public.is_org_member(uid uuid, org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members om
    where om.user_id = uid and om.organization_id = org
  );
$$;
