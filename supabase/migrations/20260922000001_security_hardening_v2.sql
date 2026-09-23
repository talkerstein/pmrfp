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

-- ── 2+3. logos / rfp-photos uploads — applied from the DASHBOARD ──────
-- Both buckets' insert policies checked only bucket_id, so any signed-in
-- user could upload into another org's folder (public on their profile /
-- RFP). The SQL editor and CLI can't alter storage.objects policies
-- ("must be owner of table objects"), so these were changed on 2026-09-22
-- in Storage -> Policies, which issues:
--   ALTER POLICY "logos auth insert" ON storage.objects WITH CHECK (
--     bucket_id = 'logos' AND (storage.foldername(name))[1] IN (
--       SELECT organization_id::text FROM public.organization_members
--       WHERE user_id = auth.uid()));
--   ALTER POLICY "rfp-photos auth insert" ON storage.objects WITH CHECK (
--     bucket_id = 'rfp-photos' AND (storage.foldername(name))[1] IN (
--       SELECT organization_id::text FROM public.organization_members
--       WHERE user_id = auth.uid()));
-- Deliberately NOT executable here, so a CLI/GitHub-integration run of this
-- file doesn't fail on the ownership error.

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
-- Expect: "members admin insert" present, "members self insert" gone.
-- (Storage insert policies keep their names; their WITH CHECK is scoped.)
select policyname, cmd from pg_policies
 where tablename = 'organization_members' and schemaname = 'public'
union all
select policyname, cmd from pg_policies
 where tablename = 'objects' and schemaname = 'storage'
   and (policyname like 'logos%' or policyname like 'rfp-photos%');
