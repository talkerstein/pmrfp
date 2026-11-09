-- Direct API access, step one: what signed-in accounts can write, and safe ways
-- to read the fields that step two closes to direct reads.

-- Companies are created on the server (sign-up, town claims), never through the API.
drop policy if exists "org insert by authenticated" on public.organizations;
revoke insert on public.organizations from authenticated;

-- A member edits their own listing's details. The rest of the row (tier, ratings,
-- slug, type, link and review state) belongs to the server.
revoke update on public.organizations from authenticated;
grant update (
  name, website, phone, email, address_line_1, city, province, country, postal_code,
  short_description, full_description, years_in_business, employee_count_range,
  insurance_status, wsib_status, emergency_service, public_contact_visibility,
  logo_url, profile_completion_score, profile_status
) on public.organizations to authenticated;

-- Profile rows come from the sign-up trigger, and the email on one counts as proof
-- of who someone is, so an account only sets its own onboarding flag.
drop policy if exists "profile self insert" on public.users_profile;
revoke insert, update on public.users_profile from authenticated;
grant update (onboarding_completed) on public.users_profile to authenticated;

-- The contact details a live company chose to show. Owned by postgres like
-- rfp_public and winner_claims_public, so it reads the private columns for callers.
create or replace view public.organization_public_contact as
  select id, phone, email
  from public.organizations
  where public_contact_visibility = 'show_contact'
    and profile_status = 'approved' and status = 'active' and not is_demo;
revoke all on public.organization_public_contact from public;
grant select on public.organization_public_contact to anon, authenticated, service_role;

-- Budget and contact on one RFP, for whoever can open it: same access as the
-- "rfp full read" policy, with the poster's visibility choices applied to
-- everyone except the poster and admins.
create or replace function public.rfp_private_fields(p_rfp_id uuid)
returns table (
  budget_min numeric,
  budget_max numeric,
  contact_name text,
  contact_email text,
  contact_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when r.budget_public or a.own then r.budget_min end,
    case when r.budget_public or a.own then r.budget_max end,
    case when r.contact_visibility = 'public_contact' or a.own then r.contact_name end,
    case when r.contact_visibility = 'public_contact' or a.own then r.contact_email end,
    case when r.contact_visibility = 'public_contact' or a.own then r.contact_phone end
  from public.rfp_posts r
  cross join lateral (
    select coalesce(
      r.posted_by_user_id = auth.uid()
        or public.is_org_member(auth.uid(), r.posted_by_organization_id)
        or public.is_admin(auth.uid()),
      false
    ) as own
  ) a
  where r.id = p_rfp_id
    and (a.own or (r.status = 'published' and public.has_active_trade_access(auth.uid())));
$$;
revoke execute on function public.rfp_private_fields(uuid) from public, anon;
grant execute on function public.rfp_private_fields(uuid) to authenticated, service_role;
