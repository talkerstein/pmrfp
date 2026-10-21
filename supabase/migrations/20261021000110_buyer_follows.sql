-- Follow a buyer or town (PMRFP for Towns, Part B1).
--
-- 1. buyer_follows: one row per person per followed buyer page.
--      user_id     who follows (their own row only, see RLS).
--      org_id      their company when they followed (null for an account
--                  without one); kept when the company goes.
--      buyer_slug  the page's key, "<province-slug>/<buyer-slug>", the
--                  same key buyer_pages and buyer_claims use (the
--                  /buyers/<province>/<slug> URL). The province is part of
--                  it because slugs repeat across provinces (the Town of
--                  Cochrane in Alberta is not the one in Ontario).
--    Unique per user + page. Canada only: every key is a Canadian buyer page.
-- 2. follow_buyer(): the one way a follow is written. It locks the person,
--    so two clicks at once can't both take the last free slot, and returns
--    'followed', 'already' or 'limit'. The server passes the limit: 3 for a
--    free account, null (unlimited) for Trade Pro and trial (keep the 3 in
--    step with FREE_FOLLOW_LIMIT in src/lib/follows/rules.ts).
-- 3. buyer_follow_counts: followers per page, counts only, never who.
--    Buyer pages and the public-buyer dashboard read it ("12 contractors
--    follow this town"). Followers never make a page indexable on their own.
--
-- Access: a signed-in person reads their own follows; nobody writes through
-- the API (the server writes with the service role after its own checks,
-- including the free limit). Anyone may read the counts. Safe to re-run.

-- ── 1. Follows ────────────────────────────────────────────────────────────
create table if not exists public.buyer_follows (
  user_id uuid not null references public.users_profile (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  buyer_slug text not null check (buyer_slug ~ '^[a-z0-9-]{2,40}/[a-z0-9][a-z0-9-]{0,119}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, buyer_slug)
);

-- Who follows a page (alerts, counts).
create index if not exists buyer_follows_buyer_idx on public.buyer_follows (buyer_slug);

alter table public.buyer_follows enable row level security;

drop policy if exists "buyer follows own read" on public.buyer_follows;
create policy "buyer follows own read" on public.buyer_follows
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.buyer_follows from anon;
revoke all on public.buyer_follows from authenticated;
grant select on public.buyer_follows to authenticated;
grant select, insert, update, delete on public.buyer_follows to service_role;

-- ── 2. The write ──────────────────────────────────────────────────────────
create or replace function public.follow_buyer(p_user uuid, p_org uuid, p_key text, p_limit integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  -- One person at a time, so two follows sent at once can't both take the last free slot.
  perform pg_advisory_xact_lock(hashtextextended('pmrfp-buyer-follows:' || p_user::text, 0));
  if exists (select 1 from public.buyer_follows where user_id = p_user and buyer_slug = p_key) then
    return 'already';
  end if;
  if p_limit is not null then
    select count(*) into used from public.buyer_follows where user_id = p_user;
    if used >= p_limit then
      return 'limit';
    end if;
  end if;
  insert into public.buyer_follows (user_id, org_id, buyer_slug) values (p_user, p_org, p_key)
  on conflict (user_id, buyer_slug) do nothing;
  return 'followed';
end;
$$;

revoke all on function public.follow_buyer(uuid, uuid, text, integer) from public;
revoke all on function public.follow_buyer(uuid, uuid, text, integer) from anon;
revoke all on function public.follow_buyer(uuid, uuid, text, integer) from authenticated;
grant execute on function public.follow_buyer(uuid, uuid, text, integer) to service_role;

-- ── 3. Counts only ────────────────────────────────────────────────────────
create or replace view public.buyer_follow_counts as
  select buyer_slug, count(*)::integer as followers
  from public.buyer_follows
  group by buyer_slug;

grant select on public.buyer_follow_counts to anon, authenticated, service_role;

-- Verify: expect 0 rows before the first follow.
select count(*) as buyer_follows from public.buyer_follows;
