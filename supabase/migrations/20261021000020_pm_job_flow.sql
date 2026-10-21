-- ════════════════════════════════════════════════════════════════════
-- PM job flow: responses with a quote, a free monthly allowance, and
-- the PM's shortlist / decline / pick decisions.
-- ════════════════════════════════════════════════════════════════════
-- A job posted by a property manager, landlord, builder (GC package) or
-- owner is an rfp_posts row (source_type 'property_manager_direct' or
-- 'gc_package', with posted_by_user_id). This adds:
--
--   rfp_interests
--     quote_amount, quote_kind ('estimate' | 'firm'), quote_notes,
--     start_date          what the trade offers (all optional).
--     used_free_allowance this response used one of the free account's
--                         3 responses for the calendar month (Toronto
--                         time). Pro and trial responses leave it false.
--     lang                the trade's language when it responded (emails
--                         about this response go out in it).
--     pm_contact_shared   the PM shared their contact with this trade (the
--                         "Share my contact" button, or picking it).
--     decision_note       the PM's optional note when declining.
--     decided_at          when the PM declined, picked or passed on it.
--     outcome_notified_at when the trade was told the outcome (one email).
--     status              adds 'picked' and 'not_selected'. At most one
--                         'picked' response per job.
--   rfp_posts
--     poster_lang         the poster's language when they posted.
--     review_note         the short reason sent to the poster on reject.
--
-- Rules the database enforces (the app checks them first):
--   * At most 3 free responses per trade company per calendar month
--     (trigger rfp_interests_free_allowance; Toronto time).
--   * Responses and PM decisions are written by the server only (service
--     role, after its own checks). Signed-in users can no longer insert or
--     update rfp_interests directly; they still read their own rows.
--   * Only PMRFP review publishes or rejects a listing: a signed-in
--     non-admin can't insert a listing as 'published', or move one to
--     'published' / 'rejected' or change published_at. Closing, awarding
--     and expiring their own listing still work. The service role (admin
--     publish, keep-alive links, imports) is unaffected.
--
-- Safe to re-run.

-- ── rfp_interests: what the trade sends ─────────────────────────────
alter table public.rfp_interests add column if not exists quote_amount numeric;
alter table public.rfp_interests add column if not exists quote_kind text;
alter table public.rfp_interests add column if not exists quote_notes text;
alter table public.rfp_interests add column if not exists start_date date;
alter table public.rfp_interests add column if not exists used_free_allowance boolean not null default false;
alter table public.rfp_interests add column if not exists lang text;
-- …and what the PM decided
alter table public.rfp_interests add column if not exists pm_contact_shared boolean not null default false;
alter table public.rfp_interests add column if not exists decision_note text;
alter table public.rfp_interests add column if not exists decided_at timestamptz;
alter table public.rfp_interests add column if not exists outcome_notified_at timestamptz;

alter table public.rfp_interests drop constraint if exists rfp_interests_quote_amount_check;
alter table public.rfp_interests add constraint rfp_interests_quote_amount_check
  check (quote_amount is null or (quote_amount >= 0 and quote_amount <= 1000000000));
alter table public.rfp_interests drop constraint if exists rfp_interests_quote_kind_check;
alter table public.rfp_interests add constraint rfp_interests_quote_kind_check
  check (quote_kind is null or quote_kind in ('estimate', 'firm'));
alter table public.rfp_interests drop constraint if exists rfp_interests_quote_notes_check;
alter table public.rfp_interests add constraint rfp_interests_quote_notes_check
  check (quote_notes is null or char_length(quote_notes) <= 2000);
alter table public.rfp_interests drop constraint if exists rfp_interests_lang_check;
alter table public.rfp_interests add constraint rfp_interests_lang_check
  check (lang is null or lang in ('en', 'fr', 'es'));
alter table public.rfp_interests drop constraint if exists rfp_interests_decision_note_check;
alter table public.rfp_interests add constraint rfp_interests_decision_note_check
  check (decision_note is null or char_length(decision_note) <= 1000);
alter table public.rfp_interests drop constraint if exists rfp_interests_status_check;
alter table public.rfp_interests add constraint rfp_interests_status_check
  check (status in ('submitted', 'viewed', 'contact_revealed', 'shortlisted', 'declined', 'closed', 'picked', 'not_selected'));

-- One pick per job.
create unique index if not exists rfp_interests_one_pick
  on public.rfp_interests (rfp_id) where status = 'picked';
-- The monthly free-allowance count.
create index if not exists rfp_interests_free_month_idx
  on public.rfp_interests (trade_organization_id, created_at) where used_free_allowance;

-- ── rfp_posts ───────────────────────────────────────────────────────
alter table public.rfp_posts add column if not exists poster_lang text;
alter table public.rfp_posts add column if not exists review_note text;
alter table public.rfp_posts drop constraint if exists rfp_posts_poster_lang_check;
alter table public.rfp_posts add constraint rfp_posts_poster_lang_check
  check (poster_lang is null or poster_lang in ('en', 'fr', 'es'));
alter table public.rfp_posts drop constraint if exists rfp_posts_review_note_check;
alter table public.rfp_posts add constraint rfp_posts_review_note_check
  check (review_note is null or char_length(review_note) <= 1000);

-- ── Free allowance: 3 responses per company per calendar month ─────
-- Keep the 3 in step with FREE_MONTHLY_RESPONSES in src/lib/pm-jobs/rules.ts.
create or replace function public.enforce_free_response_allowance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
  month_start timestamptz;
begin
  if not coalesce(new.used_free_allowance, false) then
    return new;
  end if;
  -- One company at a time, so two responses sent at once can't both take the last one.
  perform pg_advisory_xact_lock(hashtextextended('pmrfp-free-responses:' || new.trade_organization_id::text, 0));
  month_start := date_trunc('month', now() at time zone 'America/Toronto') at time zone 'America/Toronto';
  select count(*) into used
    from public.rfp_interests
   where trade_organization_id = new.trade_organization_id
     and used_free_allowance
     and created_at >= month_start;
  if used >= 3 then
    raise exception 'free response limit reached' using errcode = 'P0001', hint = 'pmrfp_free_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists rfp_interests_free_allowance on public.rfp_interests;
create trigger rfp_interests_free_allowance
  before insert on public.rfp_interests
  for each row execute function public.enforce_free_response_allowance();

-- ── Responses and decisions are server-side only ───────────────────
drop policy if exists "interest insert paid member" on public.rfp_interests;
drop policy if exists "interest update owner/admin" on public.rfp_interests;
revoke insert, update, delete on public.rfp_interests from anon;
revoke insert, update, delete on public.rfp_interests from authenticated;
-- Reads are unchanged ("interest read involved": the trade's members, the poster, admins).
grant select on public.rfp_interests to authenticated;

-- ── Only review publishes ───────────────────────────────────────────
create or replace function public.guard_rfp_post_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  -- The service role, SQL jobs (no signed-in user) and admins: unchanged.
  if uid is null or public.is_admin(uid) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending_review') or new.published_at is not null then
      raise exception 'A new listing waits for PMRFP review' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('published', 'rejected') then
    raise exception 'Only PMRFP review can publish or reject a listing' using errcode = '42501';
  end if;
  if new.published_at is distinct from old.published_at then
    raise exception 'Only PMRFP review can publish a listing' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rfp_posts_guard_status on public.rfp_posts;
create trigger rfp_posts_guard_status
  before insert or update on public.rfp_posts
  for each row execute function public.guard_rfp_post_status();

-- Verify: expect the new columns, and no client insert/update on rfp_interests.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'rfp_interests'
   and column_name in ('quote_amount', 'quote_kind', 'start_date', 'used_free_allowance', 'pm_contact_shared', 'decided_at')
 order by column_name;

-- Explicit Data API access: grants and RLS are separate requirements.
grant select, insert, update, delete on public.rfp_interests to service_role;
grant select, insert, update, delete on public.rfp_posts to service_role;
