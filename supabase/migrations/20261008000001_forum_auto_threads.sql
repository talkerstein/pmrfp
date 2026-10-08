-- ════════════════════════════════════════════════════════════════════
-- Forum auto-threads: one clearly labelled "PMRFP Board · automatic post"
-- discussion thread per real public tender / RFP / contract award.
-- ════════════════════════════════════════════════════════════════════
-- * forum_profiles.is_system marks the PMRFP Board account (not a person).
-- * forum_threads.auto_source / auto_source_key record where an automatic
--   thread came from; the unique key means a record never gets two threads.
-- The app (src/lib/forum/auto-threads*.ts) no-ops until this is applied.
-- Safe to re-run.

alter table public.forum_profiles add column if not exists is_system boolean not null default false;

alter table public.forum_threads add column if not exists auto_source text
  check (auto_source is null or auto_source in ('tender', 'award', 'rfp'));
alter table public.forum_threads add column if not exists auto_source_key text;

create unique index if not exists forum_threads_auto_source_key_idx
  on public.forum_threads(auto_source_key) where auto_source_key is not null;
create index if not exists forum_threads_auto_list_idx
  on public.forum_threads(category_id, status, last_post_at desc) where auto_source_key is null;

-- System accounts never earn reputation, whatever happens on their threads.
create or replace function public.forum_refresh_profile(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.forum_profiles p set
    post_count = (select count(*) from public.forum_threads where author_id = uid and status = 'approved')
               + (select count(*) from public.forum_posts where author_id = uid and status = 'approved'),
    reputation = case when p.is_system then 0
                 else (select coalesce(sum(points), 0) from public.forum_reputation_events where user_id = uid) end
  where p.user_id = uid;
end $$;
revoke all on function public.forum_refresh_profile(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
