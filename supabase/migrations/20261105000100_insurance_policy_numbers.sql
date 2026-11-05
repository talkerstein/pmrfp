-- A company's insurance policy number, kept out of the public profile.
-- It gets its own table because organizations rows are publicly readable.
-- The public profile only says "Insured" (organizations.insurance_status).
--
--   organization_insurance_policies   RLS: members of the company read and
--                                     write their own row; admins read.
--                                     Anon has no access at all.

create table if not exists public.organization_insurance_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  policy_number text not null check (char_length(policy_number) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists organization_insurance_policies_set_updated on public.organization_insurance_policies;
create trigger organization_insurance_policies_set_updated before update on public.organization_insurance_policies
  for each row execute function public.set_updated_at();

alter table public.organization_insurance_policies enable row level security;

drop policy if exists "insurance policy member read" on public.organization_insurance_policies;
create policy "insurance policy member read" on public.organization_insurance_policies
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "insurance policy member insert" on public.organization_insurance_policies;
create policy "insurance policy member insert" on public.organization_insurance_policies
  for insert to authenticated with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "insurance policy member update" on public.organization_insurance_policies;
create policy "insurance policy member update" on public.organization_insurance_policies
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "insurance policy member delete" on public.organization_insurance_policies;
create policy "insurance policy member delete" on public.organization_insurance_policies
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

-- Explicit Data API access: grants and RLS are separate requirements.
revoke all on public.organization_insurance_policies from anon;
revoke all on public.organization_insurance_policies from authenticated;
grant select, insert, update, delete on public.organization_insurance_policies to service_role;
grant select, delete on public.organization_insurance_policies to authenticated;
grant insert (organization_id, policy_number) on public.organization_insurance_policies to authenticated;
grant update (policy_number) on public.organization_insurance_policies to authenticated;
