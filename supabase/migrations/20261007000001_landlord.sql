-- Landlord registrant type: independent owners of rental / commercial
-- buildings. They sign up with primary_role 'property_manager' (same posting
-- rights, PM dashboard, trade invites) and get organization_type 'landlord'.
--
-- No RLS policy lists buyer organization types (PM capability gates on
-- users_profile.primary_role, and directory/listing policies allow only
-- 'trade_company' / 'supplier'), so only the CHECK constraint changes.
-- Safe to re-run.

alter table public.organizations drop constraint if exists organizations_organization_type_check;
alter table public.organizations add constraint organizations_organization_type_check
  check (organization_type in ('trade_company','property_manager','builder','owner','admin','supplier','landlord'));

-- Landlords who onboarded before this migration were stored as
-- 'property_manager' with org_kind 'landlord' in auth metadata. Re-type the
-- organizations they own.
update public.organizations o
set organization_type = 'landlord'
from public.organization_members m
join auth.users u on u.id = m.user_id
where m.organization_id = o.id
  and m.role = 'owner'
  and o.organization_type = 'property_manager'
  and u.raw_user_meta_data ->> 'org_kind' = 'landlord';
