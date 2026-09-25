-- ════════════════════════════════════════════════════════════════════
-- Jobs: companies on PMRFP hire people; job seekers apply without an account
-- ════════════════════════════════════════════════════════════════════
-- Any approved company (trade, supplier, property manager, GC) posts a job;
-- it's public while open and unexpired (30 days by default). Applications
-- are emailed to the employer and stored here for their "Hiring" page.
-- Writes go through the server (service role) only: no insert/update
-- policies. Safe to re-run.

create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{3,90}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  posted_by uuid references public.users_profile(id) on delete set null,
  title text not null check (char_length(title) between 4 and 120),
  category_id uuid references public.trade_categories(id) on delete set null,
  region_id uuid references public.regions(id) on delete set null,
  city text not null check (char_length(city) between 2 and 80),
  employment_type text not null
    check (employment_type in ('full_time', 'part_time', 'contract', 'seasonal', 'apprenticeship', 'temporary')),
  pay_min numeric check (pay_min is null or pay_min >= 0),
  pay_max numeric check (pay_max is null or pay_max >= 0),
  pay_unit text check (pay_unit in ('hour', 'day', 'year', 'project')),
  description text not null check (char_length(description) between 40 and 5000),
  requirements text check (char_length(requirements) <= 3000),
  status text not null default 'open' check (status in ('open', 'closed')),
  expires_at date not null default (current_date + 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_posts_open_idx on public.job_posts(status, expires_at);
create index if not exists job_posts_org_idx on public.job_posts(organization_id);

drop trigger if exists job_posts_set_updated on public.job_posts;
create trigger job_posts_set_updated before update on public.job_posts
  for each row execute function public.set_updated_at();

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_posts(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) <= 120),
  phone text check (char_length(phone) <= 30),
  experience_years integer check (experience_years between 0 and 60),
  certifications text check (char_length(certifications) <= 500),
  message text check (char_length(message) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists job_applications_job_idx on public.job_applications(job_id, created_at desc);

alter table public.job_posts enable row level security;
alter table public.job_applications enable row level security;

-- Public: open, unexpired jobs from approved, active companies.
-- Members of the posting company (and admins) also see closed ones.
drop policy if exists "job posts read" on public.job_posts;
create policy "job posts read" on public.job_posts
  for select using (
    (
      status = 'open'
      and expires_at >= current_date
      and exists (
        select 1 from public.organizations o
        where o.id = job_posts.organization_id and o.profile_status = 'approved' and o.status = 'active'
      )
    )
    or public.is_org_member(auth.uid(), organization_id)
    or public.is_admin(auth.uid())
  );

-- Applicants' details: only the hiring company and admins.
drop policy if exists "job applications employer read" on public.job_applications;
create policy "job applications employer read" on public.job_applications
  for select to authenticated using (
    exists (
      select 1 from public.job_posts j
      where j.id = job_applications.job_id
        and (public.is_org_member(auth.uid(), j.organization_id) or public.is_admin(auth.uid()))
    )
  );
