-- ════════════════════════════════════════════════════════════════════
-- Approved companies stay approved when they edit their profile.
-- ════════════════════════════════════════════════════════════════════
-- Before: saving /dashboard/company always set profile_status back to
-- 'pending_review' (src/lib/dashboard/actions.ts). An approved company that
-- fixed a typo dropped out of the directory, PM job alerts and free
-- responses until an admin approved it again.
--
-- Now the app leaves 'approved' alone, and this trigger flags a member's
-- edits to the fields that matter for trust (name, website, logo,
-- descriptions, contact email) for a light admin check at
-- /admin/organizations?view=edited. Nothing is unpublished while it waits.
--
--   review_flagged_at  when the first unchecked edit happened (null = nothing to check)
--   review_changes     {"<field>": {"from": <value when last checked>, "to": <value now>}}
--                      A field changed back to its old value drops out; the
--                      flag stays until an admin clears it.
--   approved_at        when the company last became approved (null = before this migration)
--
-- Only a member's own edit of an approved company is flagged. Admin and
-- service-role writes (auth.uid() null) are not. Members can't set or clear
-- these columns themselves (same idea as guard_organization_privileged).
-- Draft, pending, rejected and suspended companies keep the old flow: their
-- edits put them in pending_review and only an admin can approve them.
--
-- Repair: a company with a profile_approved karma event (the karma sync only
-- writes one while a company is approved, active and not a demo) that is now
-- pending_review can only have got there through its own edit, so it goes
-- back to approved and is flagged for the check, with an audit_logs row.
-- Skipped if an admin ever rejected or suspended it in the audit log, or
-- reversed that karma event by hand. On 2026-10-21 this matched no prod rows
-- (3 companies pending, none ever approved); it covers anyone reset by the
-- old code before this ships.
--
-- Safe to re-run.

alter table public.organizations add column if not exists approved_at timestamptz;
alter table public.organizations add column if not exists review_flagged_at timestamptz;
alter table public.organizations add column if not exists review_changes jsonb;

create index if not exists organizations_review_flagged_idx
  on public.organizations(review_flagged_at)
  where review_flagged_at is not null;

create or replace function public.track_profile_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_edit boolean := auth.uid() is not null and not public.is_admin(auth.uid());
  fields text[] := array['name', 'website', 'logo_url', 'short_description', 'full_description', 'email'];
  f text;
  old_row jsonb;
  new_row jsonb;
  changes jsonb;
  was jsonb;
begin
  if tg_op = 'INSERT' then
    if member_edit then
      new.review_flagged_at := null;
      new.review_changes := null;
      new.approved_at := null;
    end if;
    if new.profile_status = 'approved' and new.approved_at is null then
      new.approved_at := now();
    end if;
    return new;
  end if;

  if member_edit and (
    new.approved_at is distinct from old.approved_at
    or new.review_flagged_at is distinct from old.review_flagged_at
    or new.review_changes is distinct from old.review_changes
  ) then
    raise exception 'Only an administrator can change profile review fields';
  end if;

  if new.profile_status = 'approved'
     and old.profile_status is distinct from 'approved'
     and new.approved_at is not distinct from old.approved_at then
    new.approved_at := now();
  end if;

  -- A member editing an approved company that stays approved.
  if member_edit and old.profile_status = 'approved' and new.profile_status = 'approved' then
    old_row := to_jsonb(old);
    new_row := to_jsonb(new);
    changes := coalesce(old.review_changes, '{}'::jsonb);
    foreach f in array fields loop
      if (old_row -> f) is distinct from (new_row -> f) then
        was := coalesce(changes -> f -> 'from', old_row -> f);
        if was = (new_row -> f) then
          changes := changes - f;
        else
          changes := changes || jsonb_build_object(f, jsonb_build_object('from', was, 'to', new_row -> f));
        end if;
      end if;
    end loop;
    if changes is distinct from coalesce(old.review_changes, '{}'::jsonb) then
      new.review_changes := changes;
      new.review_flagged_at := coalesce(old.review_flagged_at, now());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists organizations_track_profile_review on public.organizations;
create trigger organizations_track_profile_review
  before insert or update on public.organizations
  for each row execute function public.track_profile_review();

-- ── Repair companies the old code sent back to pending_review ─────────
do $$
begin
  if to_regclass('public.karma_events') is null then
    return;
  end if;
  execute $repair$
    with restored as (
      update public.organizations o
         set profile_status = 'approved',
             review_flagged_at = coalesce(o.review_flagged_at, now()),
             review_changes = coalesce(o.review_changes, '{}'::jsonb)
       where o.profile_status = 'pending_review'
         and o.status = 'active'
         and not o.is_demo
         and exists (
           select 1 from public.karma_events e
            where e.org_id = o.id
              and e.kind = 'profile_approved'
              and (e.reversed_at is null or e.reversed_reason like 'sync:%'))
         and not exists (
           select 1 from public.audit_logs a
            where a.entity_type = 'organization'
              and a.entity_id = o.id
              and a.action in ('organization.rejected', 'organization.suspended', 'organization.approval_restored'))
      returning o.id
    )
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    select null, 'organization.approval_restored', 'organization', r.id,
           jsonb_build_object(
             'reason', 'Approved before (karma profile_approved), then sent back to pending_review by its own profile edit',
             'migration', '20261021000030_keep_approval_on_edit')
      from restored r
  $repair$;
end;
$$;

-- ── Verify ────────────────────────────────────────────────────────────
-- select count(*) from public.organizations where review_flagged_at is not null;
-- select * from public.audit_logs where action = 'organization.approval_restored';
