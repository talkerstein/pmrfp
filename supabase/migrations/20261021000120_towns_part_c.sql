-- PMRFP for Towns, Part C: the sealed quote box, results and the council
-- summary, award publishing, and the reach report's reads.
--
-- 1. rfp_posts.sealed: a town's quote request can be "Sealed until closing"
--    (opt-in per post, chosen when it's posted; fixed once it's live).
-- 2. town_closes_at(): the closing instant. The end of the closing day in
--    the town's own time zone (from the province in its page key), so a BC
--    town's box closes at midnight Pacific.
-- 3. sealed_box (a PRIVATE schema): the sealed quotes and the opening
--    request. No role has USAGE on the schema: anon, authenticated and even
--    the service role (the server's key) can't read or write these tables,
--    and the Data API can't reach them. The only way in is the functions in
--    section 5, which check who's asking and whether the box is open:
--      * a responder sees, replaces and withdraws ITS OWN quote until
--        closing (a withdrawn quote's contents are erased at once: returned
--        unopened);
--      * the town (and PMRFP admins) see a COUNT, nothing else;
--      * after closing, one town member asks to open, and a SECOND,
--        different member of the same organization confirms within 7 days
--        (or, for a one-person town, a named witness confirms through a
--        one-time link). Only then do the quotes become ordinary responses
--        (rfp_interests), so the PM job flow takes over (shortlist, decline,
--        pick, contacts revealed both ways);
--      * an admin can look inside before that only through
--        sealed_break_glass(): a written reason, logged in the town's own
--        record and notified to the town in-app.
--    Every step is written to town_job_log (Part B2, append-only) in the
--    same transaction: received, replaced, withdrawn, refused (late),
--    opening requested / cancelled / expired / confirmed / witnessed,
--    opened, break-glass. Before opening those entries carry no identity
--    (no actor, no company, no amount), only an opaque quote id; the
--    'quotes_opened' entry maps each quote id to its response.
-- 4. Guards (every role, the service role included):
--      * nothing can insert a response on a sealed post except the opening;
--      * a sealed post's closing date can't move once it has closed (or an
--        opening is under way), and its page key (its time zone) never moves;
--      * a post's sealed setting is fixed once it's live or has quotes.
-- 5. Functions (service role only; the server checks the session first and
--    passes the person as p_actor; when a signed-in JWT is present it must
--    be the same person).
-- 6. town_sealed_public: the closing instant and opening date a listing
--    shows (never a count).
-- 7. town_job_results: the town's recommendation (with its rationale) and
--    its published award. town_awards_public: what the listing shows
--    ("Awarded to X"; the amount only when the town chose to publish it).
--    The award also feeds award_history (source 'pmrfp-towns'), written by
--    the server in the importers' shape.
--
-- Canada only (town pages are Canadian). Safe to re-run.

-- ── 1. rfp_posts.sealed ─────────────────────────────────────────────
alter table public.rfp_posts add column if not exists sealed boolean not null default false;
alter table public.rfp_posts drop constraint if exists rfp_posts_sealed_check;
alter table public.rfp_posts add constraint rfp_posts_sealed_check
  check (not sealed or (source_type = 'public_buyer_direct' and post_kind = 'quote_request' and buyer_key is not null));

-- ── 2. Closing time ─────────────────────────────────────────────────
create or replace function public.town_time_zone(p_buyer_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case split_part(coalesce(p_buyer_key, ''), '/', 1)
    when 'british-columbia' then 'America/Vancouver'
    when 'alberta' then 'America/Edmonton'
    when 'saskatchewan' then 'America/Regina'
    when 'manitoba' then 'America/Winnipeg'
    when 'new-brunswick' then 'America/Moncton'
    when 'nova-scotia' then 'America/Halifax'
    when 'prince-edward-island' then 'America/Halifax'
    when 'newfoundland-and-labrador' then 'America/St_Johns'
    when 'yukon' then 'America/Whitehorse'
    when 'northwest-territories' then 'America/Yellowknife'
    when 'nunavut' then 'America/Iqaluit'
    else 'America/Toronto'
  end;
$$;

-- The end of the closing day, in the town's time zone.
create or replace function public.town_closes_at(p_deadline date, p_buyer_key text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when p_deadline is null then null
    else ((p_deadline + 1)::timestamp at time zone public.town_time_zone(p_buyer_key)) end;
$$;

grant execute on function public.town_time_zone(text) to anon, authenticated, service_role;
grant execute on function public.town_closes_at(date, text) to anon, authenticated, service_role;

-- ── 3. The private box ──────────────────────────────────────────────
create schema if not exists sealed_box;

create table if not exists sealed_box.quotes (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references public.rfp_posts (id) on delete cascade,
  trade_organization_id uuid not null references public.organizations (id) on delete cascade,
  submitted_by_user_id uuid references public.users_profile (id) on delete set null,
  -- active: in the box; withdrawn: taken back (contents erased); opened: now an rfp_interests row.
  status text not null default 'active' check (status in ('active', 'withdrawn', 'opened')),
  message text check (message is null or char_length(message) between 1 and 2000),
  relevant_experience text check (relevant_experience is null or char_length(relevant_experience) <= 2000),
  availability text check (availability is null or char_length(availability) <= 500),
  quote_amount numeric check (quote_amount is null or (quote_amount >= 0 and quote_amount <= 1000000000)),
  quote_kind text check (quote_kind is null or quote_kind in ('estimate', 'firm')),
  quote_notes text check (quote_notes is null or char_length(quote_notes) <= 2000),
  start_date date,
  case_study_ids uuid[] not null default '{}' check (cardinality(case_study_ids) <= 3),
  lang text check (lang is null or lang in ('en', 'fr', 'es')),
  version integer not null default 1 check (version between 1 and 1000),
  interest_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  opened_at timestamptz,
  unique (rfp_id, trade_organization_id),
  -- A quote in the box has a message; a withdrawn one keeps nothing.
  constraint sealed_quotes_contents check (
    (status = 'withdrawn' and message is null and quote_amount is null and quote_notes is null and relevant_experience is null and availability is null)
    or (status <> 'withdrawn' and message is not null)
  )
);

create index if not exists sealed_quotes_rfp_idx on sealed_box.quotes (rfp_id, status);

create table if not exists sealed_box.openings (
  rfp_id uuid primary key references public.rfp_posts (id) on delete cascade,
  status text not null check (status in ('requested', 'cancelled', 'expired', 'opened')),
  attempt integer not null default 1,
  requested_by uuid references public.users_profile (id) on delete set null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- A one-person town: the witness it named, and the one-time link's SHA-256 (hex). The link itself is never stored.
  witness_name text check (witness_name is null or char_length(witness_name) between 2 and 120),
  witness_email text check (witness_email is null or (char_length(witness_email) <= 254 and witness_email = lower(witness_email))),
  witness_token_hash text check (witness_token_hash is null or witness_token_hash ~ '^[0-9a-f]{64}$'),
  confirmed_by uuid references public.users_profile (id) on delete set null,
  confirmed_method text check (confirmed_method is null or confirmed_method in ('member', 'witness')),
  -- The name the witness typed when they confirmed.
  witness_confirmed_name text check (witness_confirmed_name is null or char_length(witness_confirmed_name) between 2 and 120),
  opened_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint sealed_openings_witness check ((witness_email is null) = (witness_name is null)),
  constraint sealed_openings_opened check ((status = 'opened') = (opened_at is not null))
);

-- Nobody but the functions below (their owner) reaches the box.
alter table sealed_box.quotes enable row level security;
alter table sealed_box.openings enable row level security;
revoke all on schema sealed_box from public, anon, authenticated, service_role;
revoke all on all tables in schema sealed_box from public, anon, authenticated, service_role;
revoke all on all functions in schema sealed_box from public, anon, authenticated, service_role;

-- ── 4. Guards ───────────────────────────────────────────────────────
create or replace function public.guard_sealed_post()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.sealed is distinct from old.sealed then
    if old.status not in ('draft', 'pending_review')
      or exists (select 1 from sealed_box.quotes q where q.rfp_id = old.id) then
      raise exception 'A post''s sealed setting is fixed once it is live' using errcode = '42501', hint = 'pmrfp_sealed_fixed';
    end if;
  end if;
  if old.sealed then
    if new.buyer_key is distinct from old.buyer_key then
      raise exception 'A sealed post keeps its town' using errcode = '42501', hint = 'pmrfp_sealed_fixed';
    end if;
    if new.deadline is distinct from old.deadline
      and (now() >= public.town_closes_at(old.deadline, old.buyer_key)
           or exists (select 1 from sealed_box.openings o where o.rfp_id = old.id and o.status in ('requested', 'opened'))) then
      raise exception 'The sealed box has closed: its closing date can''t move' using errcode = '42501', hint = 'pmrfp_sealed_closed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rfp_posts_guard_sealed on public.rfp_posts;
create trigger rfp_posts_guard_sealed
  before update on public.rfp_posts
  for each row execute function public.guard_sealed_post();

-- Responses on a sealed post exist only once the box is opened (the opening
-- sets pmrfp.sealed_opening for its own transaction). Named so it fires first.
create or replace function public.guard_sealed_interest()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.rfp_posts r where r.id = new.rfp_id and r.sealed)
    and coalesce(current_setting('pmrfp.sealed_opening', true), '') <> new.rfp_id::text then
    raise exception 'Quotes on this job are sealed until closing' using errcode = 'P0001', hint = 'pmrfp_sealed';
  end if;
  return new;
end;
$$;

drop trigger if exists rfp_interests_00_sealed_guard on public.rfp_interests;
create trigger rfp_interests_00_sealed_guard
  before insert or update of rfp_id on public.rfp_interests
  for each row execute function public.guard_sealed_interest();

-- ── 5. Functions ────────────────────────────────────────────────────
-- The person acting: the signed-in user when there is one (and then p_actor
-- must match), else the person the server vouches for.
create or replace function sealed_box.actor(p_actor uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null then
    if p_actor is not null and p_actor <> uid then
      return null;
    end if;
    return uid;
  end if;
  return p_actor;
end;
$$;

-- Append to the town's record (town_job_log), in the caller's transaction.
create or replace function sealed_box.log(p_rfp uuid, p_actor uuid, p_event text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.town_job_log (rfp_id, organization_id, buyer_key, actor_user_id, event, detail)
  select r.id, r.posted_by_organization_id, r.buyer_key, p_actor, p_event, coalesce(p_detail, '{}'::jsonb)
    from public.rfp_posts r where r.id = p_rfp;
$$;

-- Active people of the posting town (members whose account is active).
create or replace function sealed_box.town_member(p_user uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and p_org is not null and exists (
    select 1 from public.organization_members m
      join public.users_profile u on u.id = m.user_id
     where m.organization_id = p_org and m.user_id = p_user and coalesce(u.status, 'active') = 'active'
  );
$$;

create or replace function sealed_box.town_size(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.organization_members m
    join public.users_profile u on u.id = m.user_id
   where m.organization_id = p_org and coalesce(u.status, 'active') = 'active';
$$;

create or replace function sealed_box.person_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(trim(u.full_name), ''), u.email) from public.users_profile u where u.id = p_user;
$$;

-- A trade sends (or replaces) its sealed quote, until closing.
create or replace function public.sealed_quote_submit(
  p_rfp uuid,
  p_actor uuid,
  p_org uuid,
  p_message text,
  p_experience text default null,
  p_availability text default null,
  p_amount numeric default null,
  p_kind text default null,
  p_notes text default null,
  p_start date default null,
  p_case_study_ids uuid[] default '{}',
  p_lang text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  r record;
  o record;
  q sealed_box.quotes%rowtype;
  closes timestamptz;
  ev text;
  msg text := nullif(trim(coalesce(p_message, '')), '');
begin
  if actor is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  -- Lock the post: submissions, the closing date and the opening take turns.
  select id, sealed, status, deadline, buyer_key, posted_by_user_id, posted_by_organization_id into r
    from public.rfp_posts where id = p_rfp for update;
  if not found or not r.sealed then return jsonb_build_object('ok', false, 'error', 'not_sealed'); end if;
  if not public.is_org_member(actor, p_org) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if p_org = r.posted_by_organization_id or actor = r.posted_by_user_id then return jsonb_build_object('ok', false, 'error', 'own_job'); end if;
  select organization_type, status into o from public.organizations where id = p_org;
  if not found or o.organization_type not in ('trade_company', 'supplier') then return jsonb_build_object('ok', false, 'error', 'role'); end if;
  if o.status = 'suspended' then return jsonb_build_object('ok', false, 'error', 'suspended'); end if;
  closes := public.town_closes_at(r.deadline, r.buyer_key);
  if closes is not null and now() >= closes then
    -- Refused, and recorded (no identity: the box is still sealed).
    perform sealed_box.log(p_rfp, null, 'sealed_quote_late', jsonb_build_object('closes_at', closes));
    return jsonb_build_object('ok', false, 'error', 'late', 'closes_at', closes);
  end if;
  if r.status <> 'published' or closes is null then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if msg is null or char_length(msg) > 2000
    or (p_amount is not null and (p_amount < 0 or p_amount > 1000000000))
    or (p_kind is not null and p_kind not in ('estimate', 'firm'))
    or char_length(coalesce(p_notes, '')) > 2000
    or char_length(coalesce(p_experience, '')) > 2000
    or char_length(coalesce(p_availability, '')) > 500
    or cardinality(coalesce(p_case_study_ids, '{}')) > 3
    or (p_lang is not null and p_lang not in ('en', 'fr', 'es')) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into q from sealed_box.quotes where rfp_id = p_rfp and trade_organization_id = p_org for update;
  if not found then
    insert into sealed_box.quotes (rfp_id, trade_organization_id, submitted_by_user_id, message, relevant_experience, availability, quote_amount, quote_kind, quote_notes, start_date, case_study_ids, lang)
    values (p_rfp, p_org, actor, msg, nullif(trim(coalesce(p_experience, '')), ''), nullif(trim(coalesce(p_availability, '')), ''), p_amount, case when p_amount is null then null else p_kind end, nullif(trim(coalesce(p_notes, '')), ''), p_start, coalesce(p_case_study_ids, '{}'), p_lang)
    returning * into q;
    ev := 'sealed_quote_received';
  elsif q.status = 'opened' then
    return jsonb_build_object('ok', false, 'error', 'late', 'closes_at', closes);
  else
    ev := case when q.status = 'withdrawn' then 'sealed_quote_received' else 'sealed_quote_replaced' end;
    update sealed_box.quotes set
      status = 'active',
      submitted_by_user_id = actor,
      message = msg,
      relevant_experience = nullif(trim(coalesce(p_experience, '')), ''),
      availability = nullif(trim(coalesce(p_availability, '')), ''),
      quote_amount = p_amount,
      quote_kind = case when p_amount is null then null else p_kind end,
      quote_notes = nullif(trim(coalesce(p_notes, '')), ''),
      start_date = p_start,
      case_study_ids = coalesce(p_case_study_ids, '{}'),
      lang = p_lang,
      version = least(q.version + 1, 1000),
      withdrawn_at = null,
      updated_at = now()
    where id = q.id
    returning * into q;
  end if;
  perform sealed_box.log(p_rfp, null, ev, jsonb_build_object('quote', q.id, 'version', q.version));
  return jsonb_build_object('ok', true, 'id', q.id, 'action', case when ev = 'sealed_quote_replaced' then 'replaced' else 'received' end, 'version', q.version, 'closes_at', closes);
end;
$$;

-- A trade takes its quote back before closing. Its contents are erased (returned unopened).
create or replace function public.sealed_quote_withdraw(p_rfp uuid, p_actor uuid, p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  r record;
  q sealed_box.quotes%rowtype;
  closes timestamptz;
begin
  if actor is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  select id, sealed, deadline, buyer_key into r from public.rfp_posts where id = p_rfp for update;
  if not found or not r.sealed then return jsonb_build_object('ok', false, 'error', 'not_sealed'); end if;
  if not public.is_org_member(actor, p_org) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  closes := public.town_closes_at(r.deadline, r.buyer_key);
  if closes is null or now() >= closes then return jsonb_build_object('ok', false, 'error', 'late', 'closes_at', closes); end if;
  select * into q from sealed_box.quotes where rfp_id = p_rfp and trade_organization_id = p_org and status = 'active' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update sealed_box.quotes set
    status = 'withdrawn', message = null, relevant_experience = null, availability = null,
    quote_amount = null, quote_kind = null, quote_notes = null, start_date = null, case_study_ids = '{}',
    withdrawn_at = now(), updated_at = now()
  where id = q.id;
  perform sealed_box.log(p_rfp, null, 'sealed_quote_withdrawn', jsonb_build_object('quote', q.id, 'version', q.version));
  return jsonb_build_object('ok', true, 'id', q.id);
end;
$$;

-- A trade's own quote (its company's), at any time. Null when it has none.
create or replace function public.sealed_quote_own(p_rfp uuid, p_actor uuid, p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  q sealed_box.quotes%rowtype;
  r record;
begin
  if actor is null or not public.is_org_member(actor, p_org) then return null; end if;
  select id, deadline, buyer_key into r from public.rfp_posts where id = p_rfp and sealed;
  if not found then return null; end if;
  select * into q from sealed_box.quotes where rfp_id = p_rfp and trade_organization_id = p_org;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', q.id, 'status', q.status, 'version', q.version,
    'message', q.message, 'relevant_experience', q.relevant_experience, 'availability', q.availability,
    'quote_amount', q.quote_amount, 'quote_kind', q.quote_kind, 'quote_notes', q.quote_notes,
    'start_date', q.start_date, 'case_study_ids', to_jsonb(q.case_study_ids), 'lang', q.lang,
    'created_at', q.created_at, 'updated_at', q.updated_at, 'withdrawn_at', q.withdrawn_at, 'opened_at', q.opened_at,
    'interest_id', q.interest_id,
    'closes_at', public.town_closes_at(r.deadline, r.buyer_key)
  );
end;
$$;

-- What the town (or an admin) sees of its box: counts and the opening's state, never a quote.
create or replace function public.sealed_box_state(p_rfp uuid, p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  r record;
  op sealed_box.openings%rowtype;
  closes timestamptz;
  received integer;
  withdrawn integer;
  opening jsonb := null;
begin
  select id, sealed, deadline, buyer_key, posted_by_user_id, posted_by_organization_id into r from public.rfp_posts where id = p_rfp;
  if not found or not r.sealed then return null; end if;
  if actor is null or not (public.is_org_member(actor, r.posted_by_organization_id) or actor = r.posted_by_user_id or public.is_admin(actor)) then
    return null;
  end if;
  closes := public.town_closes_at(r.deadline, r.buyer_key);
  select count(*) filter (where status in ('active', 'opened')), count(*) filter (where status = 'withdrawn')
    into received, withdrawn from sealed_box.quotes where rfp_id = p_rfp;
  select * into op from sealed_box.openings where rfp_id = p_rfp;
  if found then
    opening := jsonb_build_object(
      'status', case when op.status = 'requested' and now() > op.expires_at then 'expired' else op.status end,
      'attempt', op.attempt,
      'requested_by', op.requested_by,
      'requested_by_name', sealed_box.person_name(op.requested_by),
      'requested_at', op.requested_at,
      'expires_at', op.expires_at,
      'witness_name', op.witness_name,
      'witness_email', op.witness_email,
      'confirmed_by', op.confirmed_by,
      'confirmed_by_name', sealed_box.person_name(op.confirmed_by),
      'confirmed_method', op.confirmed_method,
      'witness_confirmed_name', op.witness_confirmed_name,
      'opened_at', op.opened_at
    );
  end if;
  return jsonb_build_object(
    'sealed', true,
    'closes_at', closes,
    'time_zone', public.town_time_zone(r.buyer_key),
    'closed', closes is not null and now() >= closes,
    'received', received,
    'withdrawn', withdrawn,
    'members', sealed_box.town_size(r.posted_by_organization_id),
    'opening', opening
  );
end;
$$;

-- Counts per post (dashboards, the reach report). Counts only.
create or replace function public.sealed_counts(p_rfps uuid[])
returns table (rfp_id uuid, received integer, opened boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id,
         (select count(*)::integer from sealed_box.quotes q where q.rfp_id = r.id and q.status in ('active', 'opened')),
         exists (select 1 from sealed_box.openings o where o.rfp_id = r.id and o.status = 'opened')
    from public.rfp_posts r
   where r.id = any (p_rfps) and r.sealed;
$$;

-- Who to tell about an answer or an addendum while the box is sealed (user
-- ids only; the server sends the notice and never shows them).
create or replace function public.sealed_responder_ids(p_rfp uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct q.submitted_by_user_id) filter (where q.submitted_by_user_id is not null), '{}')
    from sealed_box.quotes q join public.rfp_posts r on r.id = q.rfp_id
   where q.rfp_id = p_rfp and r.sealed and q.status = 'active';
$$;

-- Open the box (the second confirmation or the witness): quotes in the box
-- become responses; withdrawn ones stay erased. Inside the caller's lock.
create or replace function sealed_box.open_box(p_rfp uuid, p_confirmer uuid, p_method text, p_witness text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q sealed_box.quotes%rowtype;
  iid uuid;
  n integer := 0;
  map jsonb := '[]'::jsonb;
begin
  perform set_config('pmrfp.sealed_opening', p_rfp::text, true);
  for q in select * from sealed_box.quotes where rfp_id = p_rfp and status = 'active' order by updated_at, id loop
    iid := null;
    insert into public.rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message, relevant_experience, availability, quote_amount, quote_kind, quote_notes, start_date, case_study_ids, lang, created_at)
    values (p_rfp, q.trade_organization_id, q.submitted_by_user_id, q.message, q.relevant_experience, q.availability, q.quote_amount, q.quote_kind, q.quote_notes, q.start_date, q.case_study_ids, q.lang, q.updated_at)
    on conflict (rfp_id, trade_organization_id) do nothing
    returning id into iid;
    if iid is null then
      select i.id into iid from public.rfp_interests i where i.rfp_id = p_rfp and i.trade_organization_id = q.trade_organization_id;
    end if;
    update sealed_box.quotes set status = 'opened', interest_id = iid, opened_at = now(), updated_at = now() where id = q.id;
    map := map || jsonb_build_array(jsonb_build_object('quote', q.id, 'response', iid));
    n := n + 1;
  end loop;
  perform set_config('pmrfp.sealed_opening', '', true);
  update sealed_box.openings set
    status = 'opened', opened_at = now(), confirmed_by = p_confirmer, confirmed_method = p_method,
    witness_confirmed_name = p_witness, witness_token_hash = null, updated_at = now()
  where rfp_id = p_rfp;
  perform sealed_box.log(p_rfp, p_confirmer, case when p_method = 'witness' then 'opening_witnessed' else 'opening_confirmed' end,
    case when p_method = 'witness' then jsonb_build_object('witness', p_witness) else '{}'::jsonb end);
  perform sealed_box.log(p_rfp, p_confirmer, 'quotes_opened', jsonb_build_object('count', n, 'method', p_method, 'responses', map));
  return n;
end;
$$;

-- Step 1 of the opening: a town member asks, after closing. A town of two
-- or more needs a second member; a one-person town names a witness (the
-- server sends them a one-time link and passes its SHA-256 here).
create or replace function public.sealed_open_request(p_rfp uuid, p_actor uuid, p_witness_name text default null, p_witness_email text default null, p_token_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  r record;
  op sealed_box.openings%rowtype;
  closes timestamptz;
  size integer;
  wname text := nullif(trim(coalesce(p_witness_name, '')), '');
  wemail text := nullif(lower(trim(coalesce(p_witness_email, ''))), '');
  mine text;
  next_attempt integer := 1;
  expires timestamptz := now() + interval '7 days';
begin
  if actor is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  select id, sealed, status, deadline, buyer_key, posted_by_organization_id into r from public.rfp_posts where id = p_rfp for update;
  if not found or not r.sealed then return jsonb_build_object('ok', false, 'error', 'not_sealed'); end if;
  if not sealed_box.town_member(actor, r.posted_by_organization_id) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  closes := public.town_closes_at(r.deadline, r.buyer_key);
  if closes is null or now() < closes then return jsonb_build_object('ok', false, 'error', 'not_closed', 'closes_at', closes); end if;
  if r.status not in ('published', 'closed', 'expired') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  select * into op from sealed_box.openings where rfp_id = p_rfp for update;
  if found then
    if op.status = 'opened' then return jsonb_build_object('ok', false, 'error', 'already_open'); end if;
    if op.status = 'requested' and now() <= op.expires_at then return jsonb_build_object('ok', false, 'error', 'pending', 'expires_at', op.expires_at); end if;
    if op.status = 'requested' then
      update sealed_box.openings set status = 'expired', witness_token_hash = null, updated_at = now() where rfp_id = p_rfp;
      perform sealed_box.log(p_rfp, null, 'opening_expired', jsonb_build_object('requested_at', op.requested_at, 'expires_at', op.expires_at));
    end if;
    next_attempt := op.attempt + 1;
  end if;
  size := sealed_box.town_size(r.posted_by_organization_id);
  if wemail is not null or wname is not null then
    if size > 1 then return jsonb_build_object('ok', false, 'error', 'use_colleague'); end if;
    if wname is null or char_length(wname) < 2 or char_length(wname) > 120 then return jsonb_build_object('ok', false, 'error', 'witness_name'); end if;
    if wemail is null or char_length(wemail) > 254 or wemail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'error', 'witness_email'); end if;
    select lower(email) into mine from public.users_profile where id = actor;
    if mine is not null and mine = wemail then return jsonb_build_object('ok', false, 'error', 'witness_self'); end if;
    if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  elsif size < 2 then
    return jsonb_build_object('ok', false, 'error', 'needs_witness');
  end if;
  insert into sealed_box.openings (rfp_id, status, attempt, requested_by, requested_at, expires_at, witness_name, witness_email, witness_token_hash, confirmed_by, confirmed_method, witness_confirmed_name, opened_at, updated_at)
  values (p_rfp, 'requested', next_attempt, actor, now(), expires, wname, wemail, case when wemail is null then null else p_token_hash end, null, null, null, null, now())
  on conflict (rfp_id) do update set
    status = 'requested', attempt = excluded.attempt, requested_by = excluded.requested_by, requested_at = excluded.requested_at,
    expires_at = excluded.expires_at, witness_name = excluded.witness_name, witness_email = excluded.witness_email,
    witness_token_hash = excluded.witness_token_hash, confirmed_by = null, confirmed_method = null,
    witness_confirmed_name = null, opened_at = null, updated_at = now();
  perform sealed_box.log(p_rfp, actor, 'opening_requested', jsonb_build_object('witness', wname, 'expires_at', expires, 'attempt', next_attempt));
  return jsonb_build_object('ok', true, 'expires_at', expires, 'witness', wemail is not null, 'members', size);
end;
$$;

-- Step 2: a different member of the same town confirms within 7 days, and the box opens.
create or replace function public.sealed_open_confirm(p_rfp uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  r record;
  op sealed_box.openings%rowtype;
  n integer;
begin
  if actor is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  select id, sealed, posted_by_organization_id into r from public.rfp_posts where id = p_rfp for update;
  if not found or not r.sealed then return jsonb_build_object('ok', false, 'error', 'not_sealed'); end if;
  if not sealed_box.town_member(actor, r.posted_by_organization_id) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into op from sealed_box.openings where rfp_id = p_rfp for update;
  if not found or op.status in ('cancelled', 'expired') then return jsonb_build_object('ok', false, 'error', 'no_request'); end if;
  if op.status = 'opened' then return jsonb_build_object('ok', false, 'error', 'already_open'); end if;
  if now() > op.expires_at then
    update sealed_box.openings set status = 'expired', witness_token_hash = null, updated_at = now() where rfp_id = p_rfp;
    perform sealed_box.log(p_rfp, null, 'opening_expired', jsonb_build_object('requested_at', op.requested_at, 'expires_at', op.expires_at));
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if op.requested_by is not distinct from actor then return jsonb_build_object('ok', false, 'error', 'same_person'); end if;
  n := sealed_box.open_box(p_rfp, actor, 'member', null);
  return jsonb_build_object('ok', true, 'opened', n);
end;
$$;

-- What the witness's page shows before they confirm (counts only), when the link is good.
create or replace function public.sealed_witness_info(p_rfp uuid, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  op sealed_box.openings%rowtype;
begin
  select * into op from sealed_box.openings where rfp_id = p_rfp;
  if not found or op.witness_token_hash is null or p_token is null
    or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> op.witness_token_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_link');
  end if;
  if op.status <> 'requested' then return jsonb_build_object('ok', false, 'error', 'bad_link'); end if;
  if now() > op.expires_at then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  select id, title, buyer_name, deadline, buyer_key into r from public.rfp_posts where id = p_rfp;
  return jsonb_build_object(
    'ok', true,
    'title', r.title,
    'buyer_name', r.buyer_name,
    'closes_at', public.town_closes_at(r.deadline, r.buyer_key),
    'received', (select count(*) from sealed_box.quotes q where q.rfp_id = p_rfp and q.status = 'active'),
    'requested_by_name', sealed_box.person_name(op.requested_by),
    'requested_at', op.requested_at,
    'expires_at', op.expires_at,
    'witness_name', op.witness_name
  );
end;
$$;

-- The witness confirms through their one-time link (single use), and the box opens.
create or replace function public.sealed_open_witness(p_rfp uuid, p_token text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  op sealed_box.openings%rowtype;
  n integer;
  typed text := nullif(trim(coalesce(p_name, '')), '');
begin
  perform 1 from public.rfp_posts where id = p_rfp and sealed for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_link'); end if;
  select * into op from sealed_box.openings where rfp_id = p_rfp for update;
  if not found or op.status <> 'requested' or op.witness_token_hash is null or p_token is null
    or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> op.witness_token_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_link');
  end if;
  if now() > op.expires_at then
    update sealed_box.openings set status = 'expired', witness_token_hash = null, updated_at = now() where rfp_id = p_rfp;
    perform sealed_box.log(p_rfp, null, 'opening_expired', jsonb_build_object('requested_at', op.requested_at, 'expires_at', op.expires_at));
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if typed is null or char_length(typed) < 2 or char_length(typed) > 120 then return jsonb_build_object('ok', false, 'error', 'witness_name'); end if;
  n := sealed_box.open_box(p_rfp, null, 'witness', typed);
  return jsonb_build_object('ok', true, 'opened', n);
end;
$$;

-- A new one-time link for the same witness (the old one stops working).
create or replace function public.sealed_open_witness_relink(p_rfp uuid, p_actor uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  r record;
  op sealed_box.openings%rowtype;
begin
  if actor is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select id, posted_by_organization_id into r from public.rfp_posts where id = p_rfp and sealed for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_sealed'); end if;
  if not sealed_box.town_member(actor, r.posted_by_organization_id) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into op from sealed_box.openings where rfp_id = p_rfp for update;
  if not found or op.status <> 'requested' or op.witness_email is null or now() > op.expires_at then
    return jsonb_build_object('ok', false, 'error', 'no_request');
  end if;
  update sealed_box.openings set witness_token_hash = p_token_hash, updated_at = now() where rfp_id = p_rfp;
  perform sealed_box.log(p_rfp, actor, 'opening_link_resent', jsonb_build_object('witness', op.witness_name));
  return jsonb_build_object('ok', true, 'witness_email', op.witness_email, 'witness_name', op.witness_name, 'expires_at', op.expires_at);
end;
$$;

-- Any member of the town cancels a pending request.
create or replace function public.sealed_open_cancel(p_rfp uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  r record;
  op sealed_box.openings%rowtype;
begin
  if actor is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  select id, posted_by_organization_id into r from public.rfp_posts where id = p_rfp and sealed for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_sealed'); end if;
  if not sealed_box.town_member(actor, r.posted_by_organization_id) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into op from sealed_box.openings where rfp_id = p_rfp for update;
  if not found or op.status <> 'requested' then return jsonb_build_object('ok', false, 'error', 'no_request'); end if;
  update sealed_box.openings set status = 'cancelled', witness_token_hash = null, updated_at = now() where rfp_id = p_rfp;
  perform sealed_box.log(p_rfp, actor, 'opening_cancelled', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- Break-glass: a PMRFP admin looks inside a sealed box before it's opened,
-- with a written reason. Logged in the town's own record, and every member
-- of the town is told in-app. It does not open the box for the town.
create or replace function public.sealed_break_glass(p_rfp uuid, p_actor uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := sealed_box.actor(p_actor);
  r record;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
  quotes jsonb;
  n integer;
begin
  if actor is null or not public.is_admin(actor) then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  if reason is null or char_length(reason) < 10 or char_length(reason) > 1000 then return jsonb_build_object('ok', false, 'error', 'reason'); end if;
  select id, title, sealed, posted_by_organization_id into r from public.rfp_posts where id = p_rfp;
  if not found or not r.sealed then return jsonb_build_object('ok', false, 'error', 'not_sealed'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'quote', q.id, 'status', q.status, 'company', o.name, 'organization_id', q.trade_organization_id,
           'quote_amount', q.quote_amount, 'quote_kind', q.quote_kind, 'start_date', q.start_date,
           'quote_notes', q.quote_notes, 'message', q.message, 'version', q.version, 'updated_at', q.updated_at
         ) order by q.updated_at), '[]'::jsonb), count(*)::integer
    into quotes, n
    from sealed_box.quotes q left join public.organizations o on o.id = q.trade_organization_id
   where q.rfp_id = p_rfp and q.status in ('active', 'opened');
  perform sealed_box.log(p_rfp, actor, 'sealed_break_glass', jsonb_build_object('reason', reason, 'count', n, 'admin', sealed_box.person_name(actor)));
  insert into public.notifications (user_id, type, title, message, link_url)
  select m.user_id, 'sealed_break_glass', 'PMRFP staff looked inside your sealed quote box', left(r.title || ': ' || reason, 500), '/buyer-dashboard/jobs/' || p_rfp::text || '#record'
    from public.organization_members m where m.organization_id = r.posted_by_organization_id;
  return jsonb_build_object('ok', true, 'quotes', quotes, 'count', n);
end;
$$;

-- The server's key only: every function above checks the person itself.
do $fn$
declare
  f text;
begin
  foreach f in array array[
    'public.sealed_quote_submit(uuid, uuid, uuid, text, text, text, numeric, text, text, date, uuid[], text)',
    'public.sealed_quote_withdraw(uuid, uuid, uuid)',
    'public.sealed_quote_own(uuid, uuid, uuid)',
    'public.sealed_box_state(uuid, uuid)',
    'public.sealed_counts(uuid[])',
    'public.sealed_responder_ids(uuid)',
    'public.sealed_open_request(uuid, uuid, text, text, text)',
    'public.sealed_open_confirm(uuid, uuid)',
    'public.sealed_witness_info(uuid, text)',
    'public.sealed_open_witness(uuid, text, text)',
    'public.sealed_open_witness_relink(uuid, uuid, text)',
    'public.sealed_open_cancel(uuid, uuid)',
    'public.sealed_break_glass(uuid, uuid, text)',
    'public.guard_sealed_post()',
    'public.guard_sealed_interest()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.sealed_quote_submit(uuid, uuid, uuid, text, text, text, numeric, text, text, date, uuid[], text)',
    'public.sealed_quote_withdraw(uuid, uuid, uuid)',
    'public.sealed_quote_own(uuid, uuid, uuid)',
    'public.sealed_box_state(uuid, uuid)',
    'public.sealed_counts(uuid[])',
    'public.sealed_responder_ids(uuid)',
    'public.sealed_open_request(uuid, uuid, text, text, text)',
    'public.sealed_open_confirm(uuid, uuid)',
    'public.sealed_witness_info(uuid, text)',
    'public.sealed_open_witness(uuid, text, text)',
    'public.sealed_open_witness_relink(uuid, uuid, text)',
    'public.sealed_open_cancel(uuid, uuid)',
    'public.sealed_break_glass(uuid, uuid, text)'
  ] loop
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$fn$;
revoke all on all functions in schema sealed_box from public, anon, authenticated, service_role;

-- ── 6. What a listing shows ─────────────────────────────────────────
-- A sealed post's closing instant and when it was opened. Never a count.
create or replace view public.town_sealed_public as
  select
    r.id as rfp_id,
    public.town_closes_at(r.deadline, r.buyer_key) as closes_at,
    public.town_time_zone(r.buyer_key) as time_zone,
    (select o.opened_at from sealed_box.openings o where o.rfp_id = r.id and o.status = 'opened') as opened_at
  from public.rfp_posts r
  where r.sealed
    and r.source_type = 'public_buyer_direct'
    and r.status in ('published', 'closed', 'awarded', 'expired');

grant select on public.town_sealed_public to anon, authenticated, service_role;

-- ── 7. Results and the award ────────────────────────────────────────
create table if not exists public.town_job_results (
  rfp_id uuid primary key references public.rfp_posts (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  recommended_interest_id uuid references public.rfp_interests (id) on delete set null,
  rationale text check (rationale is null or char_length(rationale) between 1 and 2000),
  recommended_by uuid references auth.users (id) on delete set null,
  recommended_at timestamptz,
  award_interest_id uuid references public.rfp_interests (id) on delete set null,
  award_winner_name text check (award_winner_name is null or char_length(award_winner_name) between 1 and 300),
  award_amount numeric(16, 2) check (award_amount is null or (award_amount >= 0 and award_amount <= 1000000000)),
  award_amount_public boolean not null default false,
  award_date date,
  award_published_at timestamptz,
  award_published_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint town_job_results_award check (award_published_at is null or (award_winner_name is not null and award_date is not null))
);

-- The recommendation and the award point at this post's own responses.
create or replace function public.guard_town_job_results()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.recommended_interest_id is not null
    and not exists (select 1 from public.rfp_interests i where i.id = new.recommended_interest_id and i.rfp_id = new.rfp_id) then
    raise exception 'Recommend one of this post''s own responses' using errcode = '23514';
  end if;
  if new.award_interest_id is not null
    and not exists (select 1 from public.rfp_interests i where i.id = new.award_interest_id and i.rfp_id = new.rfp_id) then
    raise exception 'Award one of this post''s own responses' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists town_job_results_guard on public.town_job_results;
create trigger town_job_results_guard
  before insert or update on public.town_job_results
  for each row execute function public.guard_town_job_results();

alter table public.town_job_results enable row level security;

drop policy if exists "town results member admin read" on public.town_job_results;
create policy "town results member admin read" on public.town_job_results
  for select to authenticated using (
    (select public.is_admin(auth.uid()))
    or exists (
      select 1 from public.rfp_posts r
       where r.id = rfp_id
         and (r.posted_by_user_id = auth.uid() or public.is_org_member(auth.uid(), r.posted_by_organization_id))
    )
  );

revoke all on public.town_job_results from anon;
revoke all on public.town_job_results from authenticated;
grant select on public.town_job_results to authenticated;
grant select, insert, update, delete on public.town_job_results to service_role;

-- "Awarded to X" on the listing; the amount only when the town published it.
create or replace view public.town_awards_public as
  select
    x.rfp_id,
    x.award_winner_name as winner_name,
    case when x.award_amount_public then x.award_amount end as amount,
    x.award_date,
    x.award_published_at
  from public.town_job_results x
  join public.rfp_posts r on r.id = x.rfp_id
  where x.award_published_at is not null
    and r.source_type = 'public_buyer_direct'
    and r.status in ('published', 'closed', 'awarded', 'expired');

grant select on public.town_awards_public to anon, authenticated, service_role;

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.rfp_posts to service_role;
grant select, insert, update, delete on public.rfp_interests to service_role;

-- Verify: expect the new column, the private tables and no API role on the box.
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'rfp_posts' and column_name = 'sealed') as sealed_column,
  (select count(*) from pg_tables where schemaname = 'sealed_box') as sealed_tables,
  has_schema_privilege('service_role', 'sealed_box', 'USAGE') as service_role_can_reach_box;
