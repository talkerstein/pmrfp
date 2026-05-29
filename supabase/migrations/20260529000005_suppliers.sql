-- ════════════════════════════════════════════════════════════════════
-- PMRFP — Suppliers (third audience)
-- Suppliers / distributors are a payable, listable org type that behaves
-- like a trade: directory listing + RFP visibility + Pro access.
-- ════════════════════════════════════════════════════════════════════

alter table public.organizations drop constraint organizations_organization_type_check;
alter table public.organizations add constraint organizations_organization_type_check
  check (organization_type in ('trade_company','property_manager','builder','owner','admin','supplier'));

alter table public.users_profile drop constraint users_profile_primary_role_check;
alter table public.users_profile add constraint users_profile_primary_role_check
  check (primary_role in ('trade','property_manager','admin','super_admin','visitor','supplier'));

-- Suppliers get the same paid access model as trades.
create or replace function public.has_active_trade_access(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    join public.subscriptions s on s.organization_id = o.id
    where om.user_id = uid
      and o.organization_type in ('trade_company','supplier')
      and o.status <> 'suspended'
      and s.status in ('active','comped')
  );
$$;
