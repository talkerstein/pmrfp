-- ════════════════════════════════════════════════════════════════════
-- Forum v1 (spec: briefs/strategy/2026-10-06-forum-spec.md, MVP cut)
-- ════════════════════════════════════════════════════════════════════
-- Categories, threads (question | discussion), replies, thread ratings,
-- answer upvotes, a reputation ledger, reports and a mod log.
--
-- Writes go through the server (service role) only, exactly like jobs:
-- there are no insert/update/delete policies, so the anon and
-- authenticated roles can only READ approved content. The server enforces
-- verified email, rate limits, link holds and moderator rights.
--
-- Counts (replies, words, ratings, category stats, reputation, post count)
-- are denormalized by triggers so public pages read one row, not a count.
-- Ranks and badges are computed in code (src/lib/forum/rules.ts).
-- Safe to re-run.

-- ── Categories ──────────────────────────────────────────────────────
create table if not exists public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  sort integer not null default 0,
  is_public boolean not null default true,
  thread_count integer not null default 0,
  post_count integer not null default 0,
  last_post_at timestamptz,
  last_thread_id uuid,
  created_at timestamptz not null default now()
);

-- Names/blurbs shown on the site come from code (translated); these rows
-- carry ids, order and the denormalized stats.
insert into public.forum_categories (slug, name, sort) values
  ('electrical', 'Electrical', 10),
  ('hvac-mechanical', 'HVAC and Mechanical', 20),
  ('plumbing', 'Plumbing', 30),
  ('roofing-envelope', 'Roofing and Envelope', 40),
  ('painting-finishes', 'Painting and Finishes', 50),
  ('concrete-structure', 'Concrete and Structure', 60),
  ('landscaping-snow', 'Landscaping and Snow', 70),
  ('cleaning-janitorial', 'Cleaning and Janitorial', 80),
  ('general-contractors', 'General Contractors', 110),
  ('property-managers', 'Property Managers', 120),
  ('suppliers-equipment', 'Suppliers and Equipment', 130),
  ('jobs-hiring', 'Jobs and Hiring', 140),
  ('marketplace-talk', 'Marketplace Talk', 150),
  ('codes-permits', 'Codes and Permits', 160),
  ('off-topic', 'Off-topic', 170)
on conflict (slug) do nothing;

-- ── Member profiles (one per auth user, created on first post) ──────
create table if not exists public.forum_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  trade text,
  region text,
  bio text check (char_length(bio) <= 500),
  organization_id uuid references public.organizations(id) on delete set null,
  reputation integer not null default 0,
  post_count integer not null default 0,
  verified_business boolean not null default false,
  is_staff boolean not null default false,
  banned boolean not null default false,
  ban_reason text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists forum_profiles_org_idx on public.forum_profiles(organization_id);

create table if not exists public.forum_category_mods (
  category_id uuid not null references public.forum_categories(id) on delete cascade,
  user_id uuid not null references public.forum_profiles(user_id) on delete cascade,
  role text not null default 'mod' check (role in ('mod')),
  appointed_at timestamptz not null default now(),
  primary key (category_id, user_id)
);

-- ── Threads and posts ───────────────────────────────────────────────
create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  short_id text unique not null check (short_id ~ '^[a-z0-9]{6,12}$'),
  category_id uuid not null references public.forum_categories(id) on delete restrict,
  author_id uuid not null,
  type text not null check (type in ('question', 'discussion')),
  title text not null check (char_length(title) between 8 and 140),
  slug text not null check (slug ~ '^[a-z0-9-]{1,80}$'),
  body text not null check (char_length(body) between 20 and 10000),
  body_words integer not null default 0,
  status text not null default 'approved' check (status in ('held', 'approved', 'hidden')),
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  is_staff boolean not null default false,
  accepted_post_id uuid,
  reply_count integer not null default 0,
  view_count integer not null default 0,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  words_total integer not null default 0,
  flag_count integer not null default 0,
  region text,
  last_post_at timestamptz not null default now(),
  last_post_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forum_threads_author_fkey foreign key (author_id) references public.forum_profiles(user_id) on delete cascade,
  constraint forum_threads_last_user_fkey foreign key (last_post_user_id) references public.forum_profiles(user_id) on delete set null
);
create index if not exists forum_threads_list_idx on public.forum_threads(category_id, status, is_pinned desc, last_post_at desc);
create index if not exists forum_threads_author_idx on public.forum_threads(author_id, created_at desc);

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  author_id uuid not null,
  body text not null check (char_length(body) between 2 and 10000),
  body_words integer not null default 0,
  status text not null default 'approved' check (status in ('held', 'approved', 'hidden')),
  is_staff boolean not null default false,
  upvote_count integer not null default 0,
  is_accepted boolean not null default false,
  flag_count integer not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint forum_posts_author_fkey foreign key (author_id) references public.forum_profiles(user_id) on delete cascade
);
create index if not exists forum_posts_thread_idx on public.forum_posts(thread_id, status, created_at);
create index if not exists forum_posts_author_idx on public.forum_posts(author_id, created_at desc);

do $$ begin
  alter table public.forum_threads
    add constraint forum_threads_accepted_fkey foreign key (accepted_post_id) references public.forum_posts(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ── Ratings, votes, reputation ──────────────────────────────────────
create table if not exists public.forum_thread_ratings (
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  user_id uuid not null references public.forum_profiles(user_id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.forum_post_votes (
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  user_id uuid not null references public.forum_profiles(user_id) on delete cascade,
  value smallint not null default 1 check (value = 1),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Ledger: reputation = sum(points). The unique key makes every award
-- idempotent (one +5 per upvote, one +50 for a verified business, ...).
create table if not exists public.forum_reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.forum_profiles(user_id) on delete cascade,
  event text not null,
  points integer not null,
  ref_type text not null default '',
  ref_id text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, event, ref_type, ref_id)
);

-- ── Reports and mod log ─────────────────────────────────────────────
create table if not exists public.forum_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('thread', 'post')),
  target_id uuid not null,
  reporter_id uuid not null references public.forum_profiles(user_id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);
create index if not exists forum_reports_open_idx on public.forum_reports(status, created_at desc);

create table if not exists public.forum_mod_log (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ── Denormalization ─────────────────────────────────────────────────
create or replace function public.forum_refresh_thread(tid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  n integer; w integer; last_at timestamptz; last_user uuid;
begin
  select count(*), coalesce(sum(body_words), 0) into n, w
    from public.forum_posts where thread_id = tid and status = 'approved';
  select created_at, author_id into last_at, last_user
    from public.forum_posts where thread_id = tid and status = 'approved'
    order by created_at desc limit 1;
  update public.forum_threads t set
    reply_count = n,
    words_total = t.body_words + w,
    last_post_at = coalesce(last_at, t.created_at),
    last_post_user_id = coalesce(last_user, t.author_id)
  where t.id = tid;
end $$;

create or replace function public.forum_refresh_category(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.forum_categories c set
    thread_count = (select count(*) from public.forum_threads t where t.category_id = cid and t.status = 'approved'),
    post_count = (select count(*) + coalesce(sum(t.reply_count), 0) from public.forum_threads t where t.category_id = cid and t.status = 'approved'),
    last_post_at = (select max(t.last_post_at) from public.forum_threads t where t.category_id = cid and t.status = 'approved'),
    last_thread_id = (select t.id from public.forum_threads t where t.category_id = cid and t.status = 'approved' order by t.last_post_at desc limit 1)
  where c.id = cid;
end $$;

create or replace function public.forum_refresh_profile(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.forum_profiles p set
    post_count = (select count(*) from public.forum_threads where author_id = uid and status = 'approved')
               + (select count(*) from public.forum_posts where author_id = uid and status = 'approved'),
    reputation = (select coalesce(sum(points), 0) from public.forum_reputation_events where user_id = uid)
  where p.user_id = uid;
end $$;

create or replace function public.forum_posts_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; cid uuid;
begin
  r := coalesce(new, old);
  perform public.forum_refresh_thread(r.thread_id);
  select category_id into cid from public.forum_threads where id = r.thread_id;
  if cid is not null then perform public.forum_refresh_category(cid); end if;
  perform public.forum_refresh_profile(r.author_id);
  return null;
end $$;

drop trigger if exists forum_posts_changed on public.forum_posts;
create trigger forum_posts_changed after insert or delete or update of status, body_words on public.forum_posts
  for each row execute function public.forum_posts_changed();

create or replace function public.forum_threads_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    perform public.forum_refresh_thread(new.id);
    perform public.forum_refresh_category(new.category_id);
    perform public.forum_refresh_profile(new.author_id);
  end if;
  if tg_op <> 'INSERT' then
    perform public.forum_refresh_category(old.category_id);
  end if;
  if tg_op = 'DELETE' then perform public.forum_refresh_profile(old.author_id); end if;
  return null;
end $$;

drop trigger if exists forum_threads_changed on public.forum_threads;
create trigger forum_threads_changed after insert or delete or update of status, category_id, body_words on public.forum_threads
  for each row execute function public.forum_threads_changed();

create or replace function public.forum_ratings_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  tid := coalesce(new.thread_id, old.thread_id);
  update public.forum_threads t set
    rating_sum = (select coalesce(sum(score), 0) from public.forum_thread_ratings where thread_id = tid),
    rating_count = (select count(*) from public.forum_thread_ratings where thread_id = tid)
  where t.id = tid;
  return null;
end $$;

drop trigger if exists forum_ratings_changed on public.forum_thread_ratings;
create trigger forum_ratings_changed after insert or update or delete on public.forum_thread_ratings
  for each row execute function public.forum_ratings_changed();

create or replace function public.forum_votes_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  pid := coalesce(new.post_id, old.post_id);
  update public.forum_posts set upvote_count = (select count(*) from public.forum_post_votes where post_id = pid) where id = pid;
  return null;
end $$;

drop trigger if exists forum_votes_changed on public.forum_post_votes;
create trigger forum_votes_changed after insert or delete on public.forum_post_votes
  for each row execute function public.forum_votes_changed();

create or replace function public.forum_reputation_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.forum_refresh_profile(coalesce(new.user_id, old.user_id));
  return null;
end $$;

drop trigger if exists forum_reputation_changed on public.forum_reputation_events;
create trigger forum_reputation_changed after insert or delete on public.forum_reputation_events
  for each row execute function public.forum_reputation_changed();

-- Views: one cheap update per thread view, callable by anyone, touches
-- only view_count on approved threads.
create or replace function public.forum_bump_view(tid uuid)
returns void language sql security definer set search_path = public as $$
  update public.forum_threads set view_count = view_count + 1 where id = tid and status = 'approved';
$$;
revoke all on function public.forum_bump_view(uuid) from public;
grant execute on function public.forum_bump_view(uuid) to anon, authenticated;

revoke all on function public.forum_refresh_thread(uuid) from public, anon, authenticated;
revoke all on function public.forum_refresh_category(uuid) from public, anon, authenticated;
revoke all on function public.forum_refresh_profile(uuid) from public, anon, authenticated;

-- ── Row level security ──────────────────────────────────────────────
alter table public.forum_categories enable row level security;
alter table public.forum_profiles enable row level security;
alter table public.forum_category_mods enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_thread_ratings enable row level security;
alter table public.forum_post_votes enable row level security;
alter table public.forum_reputation_events enable row level security;
alter table public.forum_reports enable row level security;
alter table public.forum_mod_log enable row level security;

drop policy if exists "forum categories read" on public.forum_categories;
create policy "forum categories read" on public.forum_categories
  for select using (is_public or public.is_admin(auth.uid()));

drop policy if exists "forum profiles read" on public.forum_profiles;
create policy "forum profiles read" on public.forum_profiles
  for select using (not banned or public.is_admin(auth.uid()) or user_id = auth.uid());

drop policy if exists "forum mods read" on public.forum_category_mods;
create policy "forum mods read" on public.forum_category_mods for select using (true);

drop policy if exists "forum threads read" on public.forum_threads;
create policy "forum threads read" on public.forum_threads
  for select using (status = 'approved' or author_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "forum posts read" on public.forum_posts;
create policy "forum posts read" on public.forum_posts
  for select using (
    (status = 'approved' and exists (select 1 from public.forum_threads t where t.id = thread_id and t.status = 'approved'))
    or author_id = auth.uid() or public.is_admin(auth.uid())
  );

drop policy if exists "forum ratings own read" on public.forum_thread_ratings;
create policy "forum ratings own read" on public.forum_thread_ratings for select using (user_id = auth.uid());

drop policy if exists "forum votes own read" on public.forum_post_votes;
create policy "forum votes own read" on public.forum_post_votes for select using (user_id = auth.uid());

drop policy if exists "forum reputation own read" on public.forum_reputation_events;
create policy "forum reputation own read" on public.forum_reputation_events
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "forum reports admin read" on public.forum_reports;
create policy "forum reports admin read" on public.forum_reports for select using (public.is_admin(auth.uid()));

drop policy if exists "forum mod log admin read" on public.forum_mod_log;
create policy "forum mod log admin read" on public.forum_mod_log for select using (public.is_admin(auth.uid()));
