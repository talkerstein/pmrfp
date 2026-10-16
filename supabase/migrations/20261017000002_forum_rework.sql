-- ════════════════════════════════════════════════════════════════════
-- Forum rework (briefs/forum/2026-10-16-trade-forum-study.md)
-- ════════════════════════════════════════════════════════════════════
-- Run AFTER 20261006000002_forum.sql and 20261008000001_forum_auto_threads.sql.
-- Safe to re-run. The app reads the new columns only once they exist, so it
-- keeps working before this is applied (old rooms show under their new names).
--
--  1. Rooms: six renamed/merged rooms (old slugs redirect in the app and are
--     recorded in forum_category_redirects), new regional rooms (Prairies,
--     Atlantic, four U.S. regions), new order.
--  2. Staff guides that move to the new rooms (by auto_source_key).
--  3. Threads: country (CA/US, never mixed), recurring automatic kinds,
--     photos on threads and replies.
--  4. Polls: one question, 2-6 options, one vote per member. Results only
--     for members who voted (forum_poll_results).
--  5. Following a room.
--  6. Email when someone replies to your thread (preference + throttle log).
--  7. Photo buckets: forum-photos (public: approved posts only) and
--     forum-photos-private (new uploads, held or hidden posts).
--
-- Writes stay server-only (service role), like the rest of the forum: no
-- insert/update/delete policies on any table below.

-- ── 1. Rooms ────────────────────────────────────────────────────────
create table if not exists public.forum_category_redirects (
  old_slug text primary key,
  new_slug text not null,
  created_at timestamptz not null default now()
);
alter table public.forum_category_redirects enable row level security;
drop policy if exists "forum category redirects read" on public.forum_category_redirects;
create policy "forum category redirects read" on public.forum_category_redirects for select using (true);

-- Renames keep the row (same id, same threads). If the new room already
-- exists (re-run, or created by hand), the old room's threads and mods are
-- merged into it and the old row is removed.
do $$
declare
  r record;
  old_id uuid;
  new_id uuid;
begin
  for r in
    select * from (values
      ('marketplace-talk', 'finding-work', 'Finding work & bids'),
      ('business-pricing', 'pricing-estimating', 'Pricing & estimating'),
      ('client-talk', 'getting-paid', 'Getting paid & contracts'),
      ('job-site-stories', 'show-your-work', 'Show your work'),
      ('jobs-hiring', 'running-the-business', 'Licensing & running the business'),
      ('off-topic', 'break-room', 'Break room')
    ) as v(old_slug, new_slug, name)
  loop
    insert into public.forum_category_redirects (old_slug, new_slug) values (r.old_slug, r.new_slug)
      on conflict (old_slug) do update set new_slug = excluded.new_slug;
    select id into old_id from public.forum_categories where slug = r.old_slug;
    select id into new_id from public.forum_categories where slug = r.new_slug;
    if old_id is not null and new_id is null then
      update public.forum_categories set slug = r.new_slug, name = r.name where id = old_id;
    elsif old_id is not null and new_id is not null then
      update public.forum_threads set category_id = new_id where category_id = old_id;
      insert into public.forum_category_mods (category_id, user_id, role, appointed_at)
        select new_id, user_id, role, appointed_at from public.forum_category_mods where category_id = old_id
        on conflict (category_id, user_id) do nothing;
      delete from public.forum_categories where id = old_id;
    elsif new_id is null then
      insert into public.forum_categories (slug, name) values (r.new_slug, r.name) on conflict (slug) do nothing;
    end if;
  end loop;
end $$;

-- New regional rooms.
insert into public.forum_categories (slug, name) values
  ('prairies', 'Prairies'),
  ('atlantic', 'Atlantic Canada'),
  ('us-northeast', 'U.S. Northeast'),
  ('us-midwest', 'U.S. Midwest'),
  ('us-south', 'U.S. South'),
  ('us-west', 'U.S. West')
on conflict (slug) do nothing;

-- Order: the business rooms first, then trades, property, regions.
update public.forum_categories c set sort = v.sort, name = v.name
from (values
  ('finding-work', 1, 'Finding work & bids'),
  ('pricing-estimating', 2, 'Pricing & estimating'),
  ('getting-paid', 3, 'Getting paid & contracts'),
  ('running-the-business', 4, 'Licensing & running the business'),
  ('show-your-work', 5, 'Show your work'),
  ('break-room', 6, 'Break room'),
  ('electrical', 10, 'Electrical'),
  ('hvac-mechanical', 20, 'HVAC and Mechanical'),
  ('plumbing', 30, 'Plumbing'),
  ('roofing-envelope', 40, 'Roofing and Envelope'),
  ('painting-finishes', 50, 'Painting and Finishes'),
  ('concrete-structure', 60, 'Concrete and Structure'),
  ('landscaping-snow', 70, 'Landscaping and Snow'),
  ('cleaning-janitorial', 80, 'Cleaning and Janitorial'),
  ('general-contractors', 90, 'General Contractors'),
  ('codes-permits', 95, 'Codes and Permits'),
  ('tools-gear', 97, 'Tools, Trucks & Gear'),
  ('property-managers', 120, 'Property Managers'),
  ('condo-boards', 125, 'Condo Boards & Owners'),
  ('suppliers-equipment', 130, 'Suppliers and Equipment'),
  ('ontario', 200, 'Ontario'),
  ('quebec', 205, 'Québec'),
  ('alberta', 210, 'Alberta'),
  ('british-columbia', 215, 'British Columbia'),
  ('prairies', 220, 'Prairies'),
  ('atlantic', 225, 'Atlantic Canada'),
  ('united-states', 240, 'United States'),
  ('us-northeast', 245, 'U.S. Northeast'),
  ('us-midwest', 250, 'U.S. Midwest'),
  ('us-south', 255, 'U.S. South'),
  ('us-west', 260, 'U.S. West')
) as v(slug, sort, name)
where c.slug = v.slug;

-- ── 2. Staff guides into the new rooms ──────────────────────────────
-- Same rooms and pins as src/lib/forum/staff-guides-content.ts (tested).
-- Guides not imported yet simply have no row: the import puts them there.
update public.forum_threads t set category_id = c.id, is_pinned = v.pinned
from (values
  ('guide:A7', 'getting-paid', true),
  ('guide:A8', 'getting-paid', true),
  ('guide:A9', 'getting-paid', true),
  ('guide:A4', 'getting-paid', false),
  ('guide:A6', 'getting-paid', false),
  ('guide:D17', 'pricing-estimating', true),
  ('guide:D18', 'pricing-estimating', true),
  ('guide:B1', 'finding-work', true),
  ('guide:B2', 'finding-work', true),
  ('guide:C3', 'running-the-business', true),
  ('guide:D14', 'running-the-business', true),
  ('guide:D15', 'tools-gear', true)
) as v(key, slug, pinned)
join public.forum_categories c on c.slug = v.slug
where t.auto_source_key = v.key;

-- ── 3. Threads: country, recurring kinds, photos ────────────────────
alter table public.forum_threads add column if not exists country text
  check (country is null or country in ('CA', 'US'));
alter table public.forum_threads add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.forum_posts add column if not exists images jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.forum_threads add constraint forum_threads_images_check
    check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 4);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.forum_posts add constraint forum_posts_images_check
    check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 4);
exception when duplicate_object then null; end $$;

-- Country for existing threads: a regional room is one country; a per-listing
-- automatic thread is its listing's country (region holds its province/state).
-- Everything else stays unset (= shown in both countries).
update public.forum_threads t
set country = case when c.slug in ('united-states', 'us-northeast', 'us-midwest', 'us-south', 'us-west') then 'US' else 'CA' end
from public.forum_categories c
where c.id = t.category_id and t.country is null
  and c.slug in ('ontario', 'quebec', 'alberta', 'british-columbia', 'prairies', 'atlantic', 'united-states', 'us-northeast', 'us-midwest', 'us-south', 'us-west');

update public.forum_threads t
set country = case
  when upper(trim(t.region)) in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR')
    or lower(trim(t.region)) in ('alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','district of columbia','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming','puerto rico')
  then 'US' else 'CA' end
where t.country is null and t.auto_source in ('tender', 'award', 'rfp') and t.region is not null and trim(t.region) <> '';

-- Recurring automatic threads (src/lib/forum/recurring.ts): keyed like the
-- per-tender ones (auto_source_key, unique), so each period posts once.
alter table public.forum_threads drop constraint if exists forum_threads_auto_source_check;
alter table public.forum_threads add constraint forum_threads_auto_source_check
  check (auto_source is null or auto_source in ('tender', 'award', 'rfp', 'open-bids', 'sold-for', 'awards-week', 'weather', 'prompt', 'poll'));

create index if not exists forum_threads_country_list_idx
  on public.forum_threads(category_id, status, country, last_post_at desc);
create index if not exists forum_threads_open_questions_idx
  on public.forum_threads(status, type, reply_count, created_at desc);
create index if not exists forum_posts_photos_idx
  on public.forum_posts(status, created_at desc) where jsonb_array_length(images) > 0;

-- ── 4. Polls ────────────────────────────────────────────────────────
create table if not exists public.forum_polls (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique references public.forum_threads(id) on delete cascade,
  question text not null check (char_length(question) between 3 and 200),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.forum_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null constraint forum_poll_options_poll_id_fkey references public.forum_polls(id) on delete cascade,
  -- 0..5: at most six options per poll, enforced here as well as in the app.
  position smallint not null check (position between 0 and 5),
  label text not null check (char_length(label) between 1 and 80),
  unique (poll_id, position),
  unique (id, poll_id)
);

create table if not exists public.forum_poll_votes (
  poll_id uuid not null references public.forum_polls(id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references public.forum_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One vote per member per poll.
  primary key (poll_id, user_id),
  -- The option must belong to the same poll.
  foreign key (option_id, poll_id) references public.forum_poll_options(id, poll_id) on delete cascade
);
create index if not exists forum_poll_votes_option_idx on public.forum_poll_votes(option_id);

alter table public.forum_polls enable row level security;
alter table public.forum_poll_options enable row level security;
alter table public.forum_poll_votes enable row level security;

drop policy if exists "forum polls read" on public.forum_polls;
create policy "forum polls read" on public.forum_polls for select using (
  exists (select 1 from public.forum_threads t where t.id = thread_id and t.status = 'approved') or public.is_admin(auth.uid())
);
drop policy if exists "forum poll options read" on public.forum_poll_options;
create policy "forum poll options read" on public.forum_poll_options for select using (
  exists (
    select 1 from public.forum_polls p join public.forum_threads t on t.id = p.thread_id
    where p.id = poll_id and t.status = 'approved'
  ) or public.is_admin(auth.uid())
);
-- Votes: your own only (who voted for what is never public).
drop policy if exists "forum poll votes own read" on public.forum_poll_votes;
create policy "forum poll votes own read" on public.forum_poll_votes for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Results: counts per option, only for a member who has voted (or an admin).
create or replace function public.forum_poll_results(pid uuid)
returns table (option_id uuid, votes integer)
language sql stable security definer set search_path = public as $$
  select o.id, count(v.user_id)::integer
  from public.forum_poll_options o
  left join public.forum_poll_votes v on v.option_id = o.id
  where o.poll_id = pid
    and (
      exists (select 1 from public.forum_poll_votes mine where mine.poll_id = pid and mine.user_id = auth.uid())
      or public.is_admin(auth.uid())
    )
  group by o.id;
$$;
revoke all on function public.forum_poll_results(uuid) from public, anon;
grant execute on function public.forum_poll_results(uuid) to authenticated;

-- ── 5. Following a room ─────────────────────────────────────────────
create table if not exists public.forum_room_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.forum_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, category_id)
);
alter table public.forum_room_follows enable row level security;
drop policy if exists "forum follows own read" on public.forum_room_follows;
create policy "forum follows own read" on public.forum_room_follows for select using (user_id = auth.uid());

-- ── 6. Reply emails ─────────────────────────────────────────────────
-- 'instant' (default) or 'off'. channel_email = false also turns it off.
alter table public.notification_preferences add column if not exists forum_replies text not null default 'instant';
do $$ begin
  alter table public.notification_preferences add constraint notification_preferences_forum_replies_check
    check (forum_replies in ('instant', 'off'));
exception when duplicate_object then null; end $$;

-- At most one email per thread per member every few hours (src/lib/forum/notify.ts).
create table if not exists public.forum_reply_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  last_sent_at timestamptz not null default now(),
  sent_count integer not null default 1,
  primary key (user_id, thread_id)
);
alter table public.forum_reply_notifications enable row level security;
-- No policies: service role only.

-- ── 7. Photo buckets ────────────────────────────────────────────────
-- forum-photos is public, and only ever holds photos of approved posts.
-- forum-photos-private has no storage policies (service role only): new
-- uploads land there and stay until their post is approved; a hidden post's
-- photos move back. Some projects can't write storage.* from the SQL
-- editor; then this only warns and the app creates the buckets on first use.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('forum-photos', 'forum-photos', true, 5242880, array['image/jpeg'])
  on conflict (id) do update set public = true;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('forum-photos-private', 'forum-photos-private', false, 5242880, array['image/jpeg'])
  on conflict (id) do update set public = false;
exception when others then
  raise warning 'forum photo buckets not created here (%). The app creates them on first upload.', sqlerrm;
end $$;

notify pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────────
-- select slug, sort from public.forum_categories order by sort;              -- 31 rooms
-- select * from public.forum_category_redirects;                             -- 6 rows
-- select count(*) from public.forum_threads where auto_source_key like 'guide:%';
