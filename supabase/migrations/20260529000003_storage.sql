-- ════════════════════════════════════════════════════════════════════
-- PMRFP — Storage buckets + policies (Phase 2)
--   logos                  → public read (company logos on directory)
--   rfp-documents          → private (served via signed URLs to paid users)
--   capability-statements  → private (vendor uploads)
-- Private-bucket reads happen through server-issued signed URLs (service
-- role bypasses RLS); object writes are owner/admin scoped.
-- ════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values
  ('logos', 'logos', true),
  ('rfp-documents', 'rfp-documents', false),
  ('capability-statements', 'capability-statements', false)
on conflict (id) do nothing;

-- logos: anyone can read; authenticated users manage objects.
create policy "logos public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'logos');
create policy "logos auth insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'logos');
create policy "logos owner update" on storage.objects
  for update to authenticated using (bucket_id = 'logos' and owner = auth.uid());
create policy "logos owner delete" on storage.objects
  for delete to authenticated using (bucket_id = 'logos' and owner = auth.uid());

-- private buckets: owner/admin manage; reads via signed URLs (service role).
create policy "private insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('rfp-documents','capability-statements'));
create policy "private owner read" on storage.objects
  for select to authenticated using (
    bucket_id in ('rfp-documents','capability-statements')
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );
create policy "private owner update" on storage.objects
  for update to authenticated using (
    bucket_id in ('rfp-documents','capability-statements')
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );
create policy "private owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id in ('rfp-documents','capability-statements')
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );
