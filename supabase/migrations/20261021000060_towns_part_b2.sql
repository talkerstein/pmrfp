-- PMRFP for Towns, Part B2: towns post jobs, invite trades, and run
-- questions and addenda fairly.
--
-- 1. rfp_posts
--    source_type 'public_buyer_direct': a job posted by a public buyer (a
--    town, county, school board…) from /buyer-dashboard. It rides the PM job
--    flow (review, same-day alerts, responses, shortlist/decline/pick).
--      buyer_key          the town page ("ontario/town-of-cobourg").
--      buyer_name         the buyer's name when it posted ("Town of Cobourg").
--      post_kind          'quote_request' (an RFQ below the town's own limit:
--                         trades respond on PMRFP) or 'tender_mirror' (the
--                         official posting lives on another portal: PMRFP
--                         shows a summary and the link, and takes no
--                         responses).
--      official_url       the official posting (required for a mirror).
--      official_portal    its name ("bids&tenders", "APC", "MERX"…).
--      question_deadline  last day to ask a question (optional).
-- 2. rfp_interests: a response to a public buyer's job never uses the free
--    monthly allowance (forced false), and a tender mirror takes none at all.
-- 3. town_job_questions: a question asked privately on a public buyer's job.
--    The town answers it once; the answer is published WITHOUT the asker's
--    identity (town_job_qa_public), and sent to everyone engaged with the job.
-- 4. town_job_addenda: numbered, timestamped addenda (text plus an optional
--    link to the official document; PMRFP hosts no documents). When one
--    changes the closing date it records the old and new dates (the change
--    history on the listing).
-- 5. town_invites: every invitation a town sent (a matching trade on PMRFP,
--    or a contractor by email), for the reach report. At most 50 a town per
--    day (Toronto time), enforced here as well as in the app.
-- 6. town_job_log: append-only record of everything that happened on a
--    town's job (posted, published, questions, answers, addenda, deadline
--    changes, invites, broadcasts). No update, delete or truncate; no foreign
--    keys, so the record outlives the listing.
-- 7. town_posts_public, town_job_qa_public, town_job_addenda_public: what
--    listing pages read (anon). Public procurement details are free: no
--    paywall on a public buyer's job or its official link.
--
-- Writes go through the server (service role) after it checks who is
-- asking. Canada only (town pages are Canadian). Safe to re-run.

-- ── 1. rfp_posts ────────────────────────────────────────────────────
alter table public.rfp_posts drop constraint if exists rfp_posts_source_type_check;
alter table public.rfp_posts add constraint rfp_posts_source_type_check
  check (source_type in ('property_manager_direct','admin_seeded','public_source','partner_referral','gc_package','public_buyer_direct'));

alter table public.rfp_posts add column if not exists buyer_key text;
alter table public.rfp_posts add column if not exists buyer_name text;
alter table public.rfp_posts add column if not exists post_kind text;
alter table public.rfp_posts add column if not exists official_url text;
alter table public.rfp_posts add column if not exists official_portal text;
alter table public.rfp_posts add column if not exists question_deadline date;

alter table public.rfp_posts drop constraint if exists rfp_posts_buyer_key_check;
alter table public.rfp_posts add constraint rfp_posts_buyer_key_check
  check (buyer_key is null or buyer_key ~ '^[a-z0-9-]{2,40}/[a-z0-9][a-z0-9-]{0,119}$');
alter table public.rfp_posts drop constraint if exists rfp_posts_buyer_name_check;
alter table public.rfp_posts add constraint rfp_posts_buyer_name_check
  check (buyer_name is null or char_length(buyer_name) between 1 and 200);
alter table public.rfp_posts drop constraint if exists rfp_posts_post_kind_check;
alter table public.rfp_posts add constraint rfp_posts_post_kind_check
  check (post_kind is null or post_kind in ('quote_request', 'tender_mirror'));
alter table public.rfp_posts drop constraint if exists rfp_posts_official_url_check;
alter table public.rfp_posts add constraint rfp_posts_official_url_check
  check (official_url is null or (char_length(official_url) <= 500 and official_url ~* '^https?://[^[:space:]]+$'));
alter table public.rfp_posts drop constraint if exists rfp_posts_official_portal_check;
alter table public.rfp_posts add constraint rfp_posts_official_portal_check
  check (official_portal is null or char_length(official_portal) <= 120);
-- A public buyer's job always names its page and kind; a mirror always has its official link.
alter table public.rfp_posts drop constraint if exists rfp_posts_town_post_check;
alter table public.rfp_posts add constraint rfp_posts_town_post_check
  check (
    source_type <> 'public_buyer_direct'
    or (buyer_key is not null and post_kind is not null and (post_kind <> 'tender_mirror' or official_url is not null))
  );

create index if not exists rfp_posts_buyer_key_idx on public.rfp_posts (buyer_key) where buyer_key is not null;

-- Only a town posts as its own page, and a live town job's dates move only
-- through an addendum (the server, which records the change). Applies to
-- signed-in non-admin writes; the service role, SQL jobs and admins are
-- unaffected (the app checks them first).
create or replace function public.guard_town_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or public.is_admin(uid) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.source_type = 'public_buyer_direct' then
    if new.source_type is distinct from old.source_type
      or new.buyer_key is distinct from old.buyer_key
      or new.buyer_name is distinct from old.buyer_name
      or new.post_kind is distinct from old.post_kind
      or new.official_url is distinct from old.official_url
      or new.posted_by_organization_id is distinct from old.posted_by_organization_id then
      raise exception 'A town''s post keeps its town and kind' using errcode = '42501';
    end if;
    if new.deadline is distinct from old.deadline or new.question_deadline is distinct from old.question_deadline then
      raise exception 'Change a town''s dates with an addendum' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.source_type is distinct from 'public_buyer_direct' then
    return new;
  end if;
  -- A new town post (or a listing turned into one): the poster's own public-buyer organization and page.
  if new.posted_by_organization_id is null
    or not public.is_org_member(uid, new.posted_by_organization_id)
    or not exists (select 1 from public.organizations o where o.id = new.posted_by_organization_id and o.organization_type = 'public_buyer') then
    raise exception 'Only a public buyer posts as a town' using errcode = '42501';
  end if;
  if not exists (select 1 from public.buyer_pages p where p.buyer_key = new.buyer_key and p.organization_id = new.posted_by_organization_id)
    and not exists (select 1 from public.buyer_claims c where c.buyer_key = new.buyer_key and c.user_id = uid and c.status in ('pending', 'verified')) then
    raise exception 'Post as your own town''s page' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rfp_posts_guard_town on public.rfp_posts;
create trigger rfp_posts_guard_town
  before insert or update on public.rfp_posts
  for each row execute function public.guard_town_post();

-- ── 2. Responses to a public buyer's job ────────────────────────────
-- Named so it fires before rfp_interests_free_allowance (triggers fire in name order).
create or replace function public.guard_town_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  src text;
  kind text;
begin
  select source_type, post_kind into src, kind from public.rfp_posts where id = new.rfp_id;
  if src = 'public_buyer_direct' then
    if kind = 'tender_mirror' then
      raise exception 'Bids on this tender go to the official portal' using errcode = 'P0001', hint = 'pmrfp_official_portal';
    end if;
    -- Responding to a public buyer is always free: never one of the 3 a month.
    new.used_free_allowance := false;
  end if;
  return new;
end;
$$;

drop trigger if exists rfp_interests_0_town_guard on public.rfp_interests;
create trigger rfp_interests_0_town_guard
  before insert on public.rfp_interests
  for each row execute function public.guard_town_interest();

-- ── 3. Questions ────────────────────────────────────────────────────
create table if not exists public.town_job_questions (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts (id) on delete cascade,
  asker_user_id uuid references public.users_profile (id) on delete set null,
  asker_organization_id uuid references public.organizations (id) on delete set null,
  question text not null check (char_length(question) between 5 and 2000),
  -- The wording published with the answer (the town may take out names); the question as asked when null.
  public_question text check (public_question is null or char_length(public_question) between 5 and 2000),
  answer text check (answer is null or char_length(answer) between 2 and 4000),
  answered_by uuid references auth.users (id) on delete set null,
  answered_at timestamptz,
  status text not null default 'open' check (status in ('open', 'answered')),
  lang text check (lang is null or lang in ('en', 'fr', 'es')),
  created_at timestamptz not null default now(),
  constraint town_job_questions_answered check ((status = 'answered') = (answer is not null and answered_at is not null))
);

create index if not exists town_job_questions_rfp_idx on public.town_job_questions (rfp_id, created_at);
create index if not exists town_job_questions_open_idx on public.town_job_questions (rfp_id) where status = 'open';

-- Answered once: the answer and its published wording never change after.
create or replace function public.guard_town_answer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'answered' and (
    new.answer is distinct from old.answer
    or new.public_question is distinct from old.public_question
    or new.question is distinct from old.question
    or new.status is distinct from old.status
  ) then
    raise exception 'A question is answered once' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists town_job_questions_answer_once on public.town_job_questions;
create trigger town_job_questions_answer_once
  before update on public.town_job_questions
  for each row execute function public.guard_town_answer();

alter table public.town_job_questions enable row level security;

-- The asker reads their own; the posting town and admins read all of the job's.
drop policy if exists "town questions asker poster admin read" on public.town_job_questions;
create policy "town questions asker poster admin read" on public.town_job_questions
  for select to authenticated using (
    asker_user_id = auth.uid()
    or (select public.is_admin(auth.uid()))
    or exists (
      select 1 from public.rfp_posts r
       where r.id = rfp_id
         and (r.posted_by_user_id = auth.uid() or public.is_org_member(auth.uid(), r.posted_by_organization_id))
    )
  );

revoke all on public.town_job_questions from anon;
revoke all on public.town_job_questions from authenticated;
grant select on public.town_job_questions to authenticated;
grant select, insert, update, delete on public.town_job_questions to service_role;

-- ── 4. Addenda ──────────────────────────────────────────────────────
create table if not exists public.town_job_addenda (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts (id) on delete cascade,
  number integer not null check (number between 1 and 999),
  body text not null check (char_length(body) between 5 and 4000),
  official_url text check (official_url is null or (char_length(official_url) <= 500 and official_url ~* '^https?://[^[:space:]]+$')),
  -- Both set when this addendum moved the closing date.
  old_deadline date,
  new_deadline date,
  posted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (rfp_id, number),
  constraint town_job_addenda_deadline check ((old_deadline is null) = (new_deadline is null))
);

create index if not exists town_job_addenda_rfp_idx on public.town_job_addenda (rfp_id, number);

-- An issued addendum is a record: it is never edited (issue another one).
create or replace function public.town_job_addenda_no_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'An addendum is never edited: issue another one' using errcode = '42501';
end;
$$;

drop trigger if exists town_job_addenda_no_edit on public.town_job_addenda;
create trigger town_job_addenda_no_edit
  before update on public.town_job_addenda
  for each row execute function public.town_job_addenda_no_edit();

alter table public.town_job_addenda enable row level security;

drop policy if exists "town addenda poster admin read" on public.town_job_addenda;
create policy "town addenda poster admin read" on public.town_job_addenda
  for select to authenticated using (
    (select public.is_admin(auth.uid()))
    or exists (
      select 1 from public.rfp_posts r
       where r.id = rfp_id
         and (r.posted_by_user_id = auth.uid() or public.is_org_member(auth.uid(), r.posted_by_organization_id))
    )
  );

revoke all on public.town_job_addenda from anon;
revoke all on public.town_job_addenda from authenticated;
grant select on public.town_job_addenda to authenticated;
grant select, insert, update, delete on public.town_job_addenda to service_role;

-- ── 5. Invites ──────────────────────────────────────────────────────
create table if not exists public.town_invites (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts (id) on delete cascade,
  -- The town that sent it.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  buyer_key text check (buyer_key is null or buyer_key ~ '^[a-z0-9-]{2,40}/[a-z0-9][a-z0-9-]{0,119}$'),
  -- 'trade': a matching company on PMRFP (one person there); 'email': a contractor invited by address.
  kind text not null check (kind in ('trade', 'email')),
  trade_organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid references public.users_profile (id) on delete set null,
  email_key text not null check (char_length(email_key) between 3 and 254 and email_key = lower(email_key)),
  status text not null default 'sent' check (status in ('sent', 'failed')),
  lang text check (lang is null or lang in ('en', 'fr', 'es')),
  sent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One invitation per address per job, and per company per job.
create unique index if not exists town_invites_one_email on public.town_invites (rfp_id, email_key);
create unique index if not exists town_invites_one_company on public.town_invites (rfp_id, trade_organization_id) where trade_organization_id is not null;
create index if not exists town_invites_org_day_idx on public.town_invites (organization_id, created_at) where status = 'sent';

-- At most 50 a town per day (Toronto time). Keep the 50 in step with
-- INVITE_DAILY_MAX in src/lib/town-jobs/rules.ts.
create or replace function public.enforce_town_invite_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
  day_start timestamptz;
begin
  if new.status <> 'sent' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pmrfp-town-invites:' || new.organization_id::text, 0));
  day_start := date_trunc('day', now() at time zone 'America/Toronto') at time zone 'America/Toronto';
  select count(*) into used
    from public.town_invites
   where organization_id = new.organization_id
     and status = 'sent'
     and created_at >= day_start;
  if used >= 50 then
    raise exception 'town invite limit reached' using errcode = 'P0001', hint = 'pmrfp_town_invite_cap';
  end if;
  return new;
end;
$$;

drop trigger if exists town_invites_daily_cap on public.town_invites;
create trigger town_invites_daily_cap
  before insert on public.town_invites
  for each row execute function public.enforce_town_invite_cap();

alter table public.town_invites enable row level security;

drop policy if exists "town invites member admin read" on public.town_invites;
create policy "town invites member admin read" on public.town_invites
  for select to authenticated using (
    public.is_org_member(auth.uid(), organization_id) or (select public.is_admin(auth.uid()))
  );

revoke all on public.town_invites from anon;
revoke all on public.town_invites from authenticated;
grant select on public.town_invites to authenticated;
grant select, insert, update, delete on public.town_invites to service_role;

-- ── 6. The town's record (append-only) ──────────────────────────────
create table if not exists public.town_job_log (
  id bigint generated always as identity primary key,
  rfp_id uuid,
  organization_id uuid,
  buyer_key text,
  actor_user_id uuid,
  event text not null check (event ~ '^[a-z_]{3,40}$'),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists town_job_log_rfp_idx on public.town_job_log (rfp_id, created_at);
create index if not exists town_job_log_org_idx on public.town_job_log (organization_id, created_at);

create or replace function public.town_job_log_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'town_job_log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists town_job_log_no_change on public.town_job_log;
create trigger town_job_log_no_change
  before update or delete on public.town_job_log
  for each row execute function public.town_job_log_append_only();
drop trigger if exists town_job_log_no_truncate on public.town_job_log;
create trigger town_job_log_no_truncate
  before truncate on public.town_job_log
  for each statement execute function public.town_job_log_append_only();

alter table public.town_job_log enable row level security;

drop policy if exists "town log member admin read" on public.town_job_log;
create policy "town log member admin read" on public.town_job_log
  for select to authenticated using (
    public.is_org_member(auth.uid(), organization_id) or (select public.is_admin(auth.uid()))
  );

revoke all on public.town_job_log from anon;
revoke all on public.town_job_log from authenticated;
grant select on public.town_job_log to authenticated;
-- The server only ever inserts; the trigger refuses the rest, even for the service role.
grant select, insert, update, delete on public.town_job_log to service_role;

-- ── 7. What listing pages read ──────────────────────────────────────
-- A public buyer's job, in full: public procurement details are free to
-- every supplier. The contact only when the town chose to show it.
create or replace view public.town_posts_public as
  select
    r.id,
    r.slug,
    r.title,
    r.summary,
    r.scope,
    r.requirements,
    r.submission_instructions,
    case when r.budget_public then r.budget_min end as budget_min,
    case when r.budget_public then r.budget_max end as budget_max,
    r.deadline,
    r.question_deadline,
    r.city,
    r.province,
    r.status,
    r.published_at,
    r.buyer_key,
    coalesce(p.buyer_name, r.buyer_name) as buyer_name,
    r.post_kind,
    r.official_url,
    r.official_portal,
    -- Verified: the posting organization manages the town's page right now.
    (p.organization_id is not null and p.organization_id = r.posted_by_organization_id) as verified,
    case when r.contact_visibility = 'public_contact' then r.contact_name end as contact_name,
    case when r.contact_visibility = 'public_contact' then r.contact_email end as contact_email,
    case when r.contact_visibility = 'public_contact' then r.contact_phone end as contact_phone
  from public.rfp_posts r
  left join public.buyer_pages p on p.buyer_key = r.buyer_key
  where r.source_type = 'public_buyer_direct'
    and r.status in ('published', 'closed', 'awarded');

-- Answered questions only, and never who asked.
create or replace view public.town_job_qa_public as
  select
    q.id,
    q.rfp_id,
    coalesce(q.public_question, q.question) as question,
    q.answer,
    q.answered_at
  from public.town_job_questions q
  join public.rfp_posts r on r.id = q.rfp_id
  where q.status = 'answered'
    and r.source_type = 'public_buyer_direct'
    and r.status in ('published', 'closed', 'awarded');

create or replace view public.town_job_addenda_public as
  select
    a.id,
    a.rfp_id,
    a.number,
    a.body,
    a.official_url,
    a.old_deadline,
    a.new_deadline,
    a.created_at
  from public.town_job_addenda a
  join public.rfp_posts r on r.id = a.rfp_id
  where r.source_type = 'public_buyer_direct'
    and r.status in ('published', 'closed', 'awarded');

grant select on public.town_posts_public to anon, authenticated, service_role;
grant select on public.town_job_qa_public to anon, authenticated, service_role;
grant select on public.town_job_addenda_public to anon, authenticated, service_role;

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.rfp_posts to service_role;
grant select, insert, update, delete on public.rfp_interests to service_role;

-- Verify: expect the new rfp_posts columns.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'rfp_posts'
   and column_name in ('buyer_key', 'buyer_name', 'post_kind', 'official_url', 'official_portal', 'question_deadline')
 order by column_name;
