-- ════════════════════════════════════════════════════════════════════
-- Security hardening v2 — closes two RLS gaps in the LIVE production
-- policies, adds Stripe webhook idempotency.
-- ════════════════════════════════════════════════════════════════════
-- Found by a focused code-review pass, 2026-09-22. Both gaps are in
-- policies from 20260529000002_rls.sql / 20260529000003_storage.sql,
-- already applied to production — this is a live vulnerability, not a
-- pending-migration issue. RUN THIS FIRST, before the feature migrations
-- in briefs/ops/2026-09-20-apply-all-migrations.sql.
--
-- Idempotent — safe to re-run.

-- ── 1. organization_members: self-insert had no org check ───────────
-- "members self insert" only checked `user_id = auth.uid()`, not
-- `organization_id`. Any authenticated user could POST
-- /rest/v1/organization_members with ANY organization_id and become a
-- member of a competitor's org (using their own real JWT + the public
-- anon key, both client-exposed by design) — which then grants UPDATE
-- rights on that org's name/description/logo/slug and write access to
-- its category/region/property-type tags via the org-member policies
-- below it. The app itself never uses this policy (org creation goes
-- through the service-role client in src/lib/auth/actions.ts), so
-- restricting it to admin-only changes no legitimate behavior.
drop policy if exists "members self insert" on public.organization_members;
create policy "members admin insert" on public.organization_members
  for insert to authenticated with check (public.is_admin(auth.uid()));

-- ── 2. logos bucket: any authenticated user could write into any
--    org's public folder ────────────────────────────────────────────
-- "logos auth insert" only checked bucket_id, not the object path. Any
-- signed-in user could upload to logos/<any-org-uuid>/..., and that
-- image renders live on that org's public directory/vendor page
-- (getPortfolioPhotos() lists everything under logos/{orgId}/). Scope
-- inserts to the uploader's own organization folder — mirrors the
-- owner-scoping already applied to update/delete below.
drop policy if exists "logos auth insert" on storage.objects;
create policy "logos org-scoped insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (
      select organization_id::text
      from public.organization_members
      where user_id = auth.uid()
    )
  );

-- ── 3. rfp-photos bucket: same unscoped-insert gap as logos ─────────
-- 20260531000001_rfp_photos.sql's own comment says the path convention
-- "{orgId}/{rfpId}/{uuid}.ext keeps objects scoped per org" — but the
-- policy never enforced it, only checked bucket_id. Any authenticated
-- user could upload into another org's RFP photo folder (visible to
-- anonymous visitors on /rfps, since this bucket is public-read by
-- design). Found while verifying the logos-bucket fix above — same
-- pattern, not in the original scan.
drop policy if exists "rfp-photos auth insert" on storage.objects;
create policy "rfp-photos org-scoped insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'rfp-photos'
    and (storage.foldername(name))[1] in (
      select organization_id::text
      from public.organization_members
      where user_id = auth.uid()
    )
  );

-- ── 4. Stripe webhook idempotency ────────────────────────────────────
-- checkout.session.completed sends a customer "activated" email and an
-- admin "new sale" email with no event-id guard. Stripe retries on any
-- non-2xx response or timeout; a slow handler (several sequential
-- awaited email/GHL calls) that times out gets redelivered, and the
-- customer sees a duplicate "you're activated" email on day one.
create table if not exists public.stripe_webhook_events (
  id text primary key,
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
-- No policies: table is service-role only (webhook route uses the
-- service client, which bypasses RLS). No anon/authenticated access.

-- ── Verify ────────────────────────────────────────────────────────────
-- Expect: "members admin insert" present, "members self insert" gone;
-- "logos org-scoped insert" and "rfp-photos org-scoped insert" present,
-- the old unscoped "* auth insert" variants gone.
select policyname, cmd from pg_policies
 where tablename = 'organization_members' and schemaname = 'public'
union all
select policyname, cmd from pg_policies
 where tablename = 'objects' and schemaname = 'storage'
   and (policyname like 'logos%' or policyname like 'rfp-photos%');
