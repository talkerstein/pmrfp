-- ════════════════════════════════════════════════════════════════════
-- Security: a sign-up can no longer choose an admin role
--
-- handle_new_user() copied raw_user_meta_data.primary_role into
-- users_profile unchecked. That metadata comes from the sign-up request,
-- which anyone can send straight to Supabase Auth with the public anon key,
-- so a sign-up claiming primary_role 'super_admin' became an admin.
-- (Changing the role AFTER sign-up was already blocked by
-- guard_users_profile_privileged in 20260529000006.)
--
-- Now: only the self-serve roles are accepted from sign-up metadata;
-- anything else becomes 'trade'. A BEFORE INSERT guard also stops a
-- signed-in non-admin from inserting a profile row with an admin role
-- directly (the "profile self insert" policy doesn't restrict columns).
-- Admin roles can only be granted by an admin or the service role.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested text := nullif(new.raw_user_meta_data->>'primary_role', '');
begin
  insert into public.users_profile (id, email, full_name, primary_role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when requested in ('trade', 'property_manager', 'supplier', 'real_estate_agent', 'visitor') then requested
      else 'trade'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.guard_users_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / trigger context (no auth.uid()) and admins may set any role.
  if auth.uid() is null or public.is_admin(auth.uid()) then
    return new;
  end if;
  if new.primary_role in ('admin', 'super_admin') then
    raise exception 'Not authorized to set primary_role';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_users_profile_insert on public.users_profile;
create trigger guard_users_profile_insert
  before insert on public.users_profile
  for each row execute function public.guard_users_profile_insert();
