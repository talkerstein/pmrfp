-- ════════════════════════════════════════════════════════════════════
-- PMRFP — RFP photo storage (Phase 3)
--
-- Adds a PUBLIC storage bucket for RFP property photos. Photos are
-- intentionally public (vs. rfp-documents which is private) because:
--   1. Anonymous visitors browsing /rfps benefit from seeing the property
--      — it's the strongest signup driver for trades.
--   2. PMs uploading photos understand they're sharing a project image,
--      not a confidential drawing or RFP package.
--   3. Sensitive technical docs / drawings / pricing sheets still go to
--      the private rfp-documents bucket (gated by signed URLs).
--
-- File records are stored in the existing public.rfp_documents table with
-- visibility='public' and file_type starting with 'image/'.
-- ════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('rfp-photos', 'rfp-photos', true)
on conflict (id) do nothing;

-- Anyone can READ photos in this public bucket (no auth required — drives
-- signup intent when anon visitors browse RFPs and see the building).
create policy "rfp-photos public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'rfp-photos');

-- Authenticated users can upload. We don't gate by role here because PMs
-- (property_manager), trades, and suppliers may all eventually upload
-- supporting photos. The path convention {orgId}/{rfpId}/{uuid}.ext keeps
-- objects scoped per org for orderly management.
create policy "rfp-photos auth insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rfp-photos');

-- Owners (and admins) can update / delete their own photos.
create policy "rfp-photos owner update" on storage.objects
  for update to authenticated using (
    bucket_id = 'rfp-photos'
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "rfp-photos owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'rfp-photos'
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );
