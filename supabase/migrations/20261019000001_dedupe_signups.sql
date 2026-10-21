-- ════════════════════════════════════════════════════════════════════
-- Duplicate sign-ups and duplicate company listings.
--
-- 1. normalize_email(): trim + lowercase; for gmail.com / googlemail.com
--    also drops dots and "+tags" in the local part (Gmail delivers
--    t.miah+pmrfp@gmail.com to tmiah@gmail.com). Mirrors
--    src/lib/dedupe/email.ts normalizeEmail(). Used to compare, never to
--    rewrite: users_profile.email keeps the address as typed.
-- 2. A unique index on lower(email) for users_profile, created only when the
--    existing rows have no case-insensitive duplicates (none on 2026-10-19:
--    44 accounts, 0 duplicates). Auth already lowercases emails, so this is
--    a backstop, not a behaviour change.
-- 3. organization_join_requests: "Request to join this company" at
--    onboarding. The company's owner/admin (or a PMRFP admin when it has
--    none) approves. Service-role writes only.
-- 4. duplicate_reviews: pairs an admin has flagged, dismissed, merged or
--    disabled (/admin/duplicates). Suspected pairs are computed on read;
--    this table only remembers decisions and "it's a different company"
--    acknowledgements. Admin-only.
-- 5. organizations.merged_into: the primary listing a merged duplicate
--    now points to (the duplicate itself is kept, status 'deleted').
--
-- The app degrades without this migration: sign-up checks fall back to
-- pattern queries, join requests and dismissals report "not available yet".
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.normalize_email(e text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when split_part(lower(btrim(coalesce(e, ''))), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(btrim(e)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else lower(btrim(coalesce(e, '')))
  end
$$;

create index if not exists users_profile_email_norm_idx
  on public.users_profile (public.normalize_email(email));

do $$
begin
  if exists (
    select 1 from public.users_profile
    where email <> ''
    group by lower(email)
    having count(*) > 1
  ) then
    raise notice 'users_profile has case-insensitive duplicate emails: unique index NOT created. Resolve them in /admin/duplicates and re-run.';
  else
    create unique index if not exists users_profile_email_lower_uniq
      on public.users_profile (lower(email))
      where email <> '';
  end if;
end;
$$;

-- ── Join requests ───────────────────────────────────────────────────
create table if not exists public.organization_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'cancelled')),
  -- Why we suggested it: name / website / phone / email_domain.
  match_reasons text[] not null default '{}',
  message text check (char_length(message) <= 500),
  decided_by uuid references public.users_profile(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open request per person per company.
create unique index if not exists org_join_requests_one_pending
  on public.organization_join_requests (organization_id, user_id)
  where status = 'pending';
create index if not exists org_join_requests_org_idx
  on public.organization_join_requests (organization_id, status);
create index if not exists org_join_requests_user_idx
  on public.organization_join_requests (user_id, status);

alter table public.organization_join_requests enable row level security;

drop policy if exists "join requests read" on public.organization_join_requests;
create policy "join requests read" on public.organization_join_requests
  for select using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_join_requests.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
-- No insert/update/delete policies: the server (service role) writes.

-- ── Duplicate review decisions ──────────────────────────────────────
create table if not exists public.duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('account', 'company')),
  -- The pair, smaller uuid first (see pairKey in src/lib/dedupe/review.ts).
  a_id uuid not null,
  b_id uuid not null,
  status text not null default 'open'
    check (status in ('open', 'dismissed', 'merged', 'disabled')),
  -- 'onboarding' = they said "it's a different company"; 'admin' = flagged by hand.
  source text not null default 'admin' check (source in ('onboarding', 'signup', 'admin')),
  reasons text[] not null default '{}',
  note text check (char_length(note) <= 1000),
  resolved_by uuid references public.users_profile(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint duplicate_reviews_ordered check (a_id < b_id),
  unique (kind, a_id, b_id)
);
create index if not exists duplicate_reviews_status_idx on public.duplicate_reviews (status, created_at desc);

alter table public.duplicate_reviews enable row level security;
drop policy if exists "duplicate reviews admin read" on public.duplicate_reviews;
create policy "duplicate reviews admin read" on public.duplicate_reviews
  for select using (public.is_admin(auth.uid()));

-- ── Merged listings point at their primary ──────────────────────────
alter table public.organizations
  add column if not exists merged_into uuid references public.organizations(id) on delete set null;

-- ── Verify ──────────────────────────────────────────────────────────
-- select public.normalize_email(' T.Miah+x@GoogleMail.com ');   -- tmiah@gmail.com
-- select indexname from pg_indexes where indexname = 'users_profile_email_lower_uniq';
-- select count(*) from public.organization_join_requests;

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.duplicate_reviews to service_role;
grant select, insert, update, delete on public.organization_join_requests to service_role;
grant select on public.organization_join_requests to anon, authenticated;
grant select on public.duplicate_reviews to anon, authenticated;
