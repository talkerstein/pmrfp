-- Correction and removal requests ("Report an error or request removal").
--
-- Visitors report a wrong or outdated public-record listing, or ask for
-- personal information to be removed, from RFP pages, contract-winner pages,
-- Award Intelligence company/buyer profiles, major-project pages and
-- benchmark pages. The request is written by the server route
-- /api/corrections (rate-limited, validated) with the service role; admins
-- work the queue at /admin/corrections. Policy: /corrections.
--
-- Access: through the API only admins read and update (status/resolution,
-- RLS on is_admin). anon gets nothing and no signed-in user can insert, so a
-- request only arrives through the rate-limited route.

create table if not exists public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  page_kind text not null check (page_kind in ('rfp', 'contract_winner', 'intel_company', 'intel_buyer', 'intel_award', 'major_project', 'benchmark', 'insight', 'forum_post', 'forum_thread', 'other')),
  page_path text not null check (length(page_path) between 1 and 500 and page_path like '/%'),
  page_ref text check (page_ref is null or length(page_ref) <= 300),
  reason text not null check (reason in ('wrong_info', 'outdated', 'personal_info', 'removal', 'defamation', 'other')),
  details text not null check (length(details) between 10 and 5000),
  contact_email text not null check (length(contact_email) between 3 and 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  contact_name text check (contact_name is null or length(contact_name) <= 200),
  lang text not null default 'en' check (lang in ('en', 'fr', 'es')),
  reporter_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'in_review', 'corrected', 'removed', 'declined', 'closed')),
  resolution text check (resolution is null or length(resolution) <= 5000),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A finished request says what was done and when.
  constraint correction_requests_resolved check (
    status in ('new', 'in_review') or (resolved_at is not null and resolution is not null and length(resolution) > 0)
  )
);

create index if not exists correction_requests_status_idx on public.correction_requests (status, created_at desc);

alter table public.correction_requests enable row level security;

drop policy if exists "corrections admin read" on public.correction_requests;
create policy "corrections admin read" on public.correction_requests
  for select to authenticated using ((select public.is_admin(auth.uid())));

drop policy if exists "corrections admin update" on public.correction_requests;
create policy "corrections admin update" on public.correction_requests
  for update to authenticated
  using ((select public.is_admin(auth.uid())))
  with check ((select public.is_admin(auth.uid())));

revoke all on public.correction_requests from anon;
revoke all on public.correction_requests from authenticated;
grant select on public.correction_requests to authenticated;
grant update (status, resolution, resolved_at, resolved_by, updated_at) on public.correction_requests to authenticated;

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.correction_requests to service_role;
grant select on public.correction_requests to authenticated;
