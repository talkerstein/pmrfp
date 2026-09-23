-- Anonymous visitors could not read ANY rfp_categories row.
--
-- The public-read policy checked `exists (select 1 from rfp_posts … status =
-- 'published')`, but that subquery runs under the caller's own RLS, and anon
-- has no select policy on rfp_posts (the public reads through the rfp_public
-- view instead). So the check was always false for logged-out visitors: every
-- public card lost its trade label and `/rfps?category=…` returned nothing.
--
-- Fix: do the published check in a security-definer helper, the same pattern
-- as is_admin / is_org_member. It only answers "is this RFP id published?",
-- which rfp_public already exposes.

create or replace function public.rfp_is_published(p_rfp_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rfp_posts r
    where r.id = p_rfp_id and r.status = 'published'
  );
$$;

revoke all on function public.rfp_is_published(uuid) from public;
grant execute on function public.rfp_is_published(uuid) to anon, authenticated;

drop policy if exists "rfp_categories public read published" on public.rfp_categories;
create policy "rfp_categories public read published" on public.rfp_categories
  for select to anon, authenticated using (
    public.rfp_is_published(rfp_id)
    or exists (select 1 from public.rfp_posts r where r.id = rfp_id
               and (r.posted_by_user_id = auth.uid()
                    or public.is_org_member(auth.uid(), r.posted_by_organization_id)))
    or public.is_admin(auth.uid())
  );
