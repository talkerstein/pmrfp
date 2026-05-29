-- ============================================================
-- 0006 — Security hardening
-- Closes a privilege-escalation hole: RLS lets a user update their
-- own users_profile / organizations row, but did NOT restrict WHICH
-- columns. These BEFORE UPDATE triggers gate the privileged columns so
-- a non-admin cannot:
--   • promote themselves to admin/super_admin (users_profile.primary_role)
--   • un-suspend their own account (users_profile.status)
--   • self-approve / verify / feature / un-suspend their org
-- Admins (is_admin) and the service-role/seed context (auth.uid() is null)
-- bypass these checks.
-- ============================================================

-- ── users_profile: role + account status are admin-only ──────────────
create or replace function public.guard_users_profile_privileged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin(auth.uid()) then
    return new;
  end if;
  if new.primary_role is distinct from old.primary_role then
    raise exception 'Not authorized to change primary_role';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Not authorized to change account status';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_users_profile_privileged on public.users_profile;
create trigger guard_users_profile_privileged
  before update on public.users_profile
  for each row execute function public.guard_users_profile_privileged();

-- ── organizations: approval / verification / feature / suspension are
--    admin-only. A member may only move profile_status between 'draft'
--    and 'pending_review' (submit for review). ──────────────────────────
create or replace function public.guard_organization_privileged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin(auth.uid()) then
    return new;
  end if;
  if new.profile_status is distinct from old.profile_status
     and new.profile_status not in ('draft', 'pending_review') then
    raise exception 'Only an administrator can set profile_status to %', new.profile_status;
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only an administrator can change organization status';
  end if;
  if new.verified is distinct from old.verified then
    raise exception 'Only an administrator can change verification';
  end if;
  if new.featured is distinct from old.featured then
    raise exception 'Only an administrator can change featured status';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_organization_privileged on public.organizations;
create trigger guard_organization_privileged
  before update on public.organizations
  for each row execute function public.guard_organization_privileged();
