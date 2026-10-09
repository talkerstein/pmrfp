-- ════════════════════════════════════════════════════════════════════
-- Private project photos: a PRIVATE storage bucket for the photos of
-- unlisted and private projects.
-- ════════════════════════════════════════════════════════════════════
-- Run AFTER 20261009000002_portfolio.sql. Independent of
-- 20261010000001_karma.sql (either order). Safe to re-run.
--
-- Until now every project photo sat in the PUBLIC `project-photos` bucket,
-- so anyone holding a photo URL could open a private project's photos.
-- From this release:
--   project-photos          public bucket: photos of PUBLIC projects only
--   project-photos-private  private bucket: new uploads, and every photo of
--                           an unlisted or private project
-- The app moves a project's photos between the two whenever it is saved or
-- its visibility changes (moving deletes the old object, so the old public
-- URL stops working), and signs short-lived URLs for the people allowed to
-- see the project. Existing photos are moved once by the backfill:
--   GET  /api/projects/photo-backfill            (dry run)
--   POST /api/projects/photo-backfill?apply=1    (Bearer $CRON_SECRET)
--
-- NO storage.objects policies for this bucket, on purpose: with RLS on and
-- no policy, anon and signed-in users can't list, read, write or sign
-- anything in it. Only the service role (our server) can. Every existing
-- storage policy is scoped to its own bucket_id, so none of them reaches
-- this one.
--
-- Some projects can't write storage.* from the SQL editor ("must be owner
-- of table buckets"). Then this block only warns: the app creates the
-- bucket itself (private) on first upload or on the backfill.

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('project-photos-private', 'project-photos-private', false, 10485760, array['image/jpeg'])
  on conflict (id) do update set public = false;
exception when others then
  raise warning 'project-photos-private bucket not created here (%). The app creates it on first use; or create a PRIVATE bucket named project-photos-private in Storage.', sqlerrm;
end $$;

-- ── Verify ────────────────────────────────────────────────────────────
-- select id, public from storage.buckets where id in ('project-photos', 'project-photos-private');
--   → project-photos true, project-photos-private false
-- select policyname from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and (qual ilike '%project-photos-private%' or with_check ilike '%project-photos-private%');
--   → no rows (service role only)
