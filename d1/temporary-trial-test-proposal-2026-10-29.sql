-- REVIEW ONLY: temporary paid-access verification for the existing synthetic account.
-- Creates one non-public draft company, its membership and a 30-minute trial.
-- No customer records, subscriptions, Stripe objects, Auth credentials or charges change.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF '__APPROVE_TEMPORARY_TEST_TRIAL__'='__APPROVE_' || 'TEMPORARY_TEST_TRIAL__' THEN RAISE EXCEPTION 'Temporary private-data access requires approval'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users_profile WHERE id='aa1265f5-5298-4ec9-9292-93faa40a7272' AND email='d1-preview-20261022@example.invalid' AND primary_role='trade' AND status='active') THEN RAISE EXCEPTION 'Synthetic account does not match'; END IF;
 IF EXISTS(SELECT 1 FROM public.organization_members WHERE user_id='aa1265f5-5298-4ec9-9292-93faa40a7272') THEN RAISE EXCEPTION 'Synthetic account already has an organization'; END IF;
 IF EXISTS(SELECT 1 FROM public.organizations WHERE id='d10f2026-1029-4000-8000-000000000001' OR slug='d1-migration-test-20261029') THEN RAISE EXCEPTION 'Test company already exists'; END IF;
END $guard$;
INSERT INTO public.organizations(id,name,slug,organization_type,profile_status,status,is_demo,profile_indexable,public_contact_visibility)
VALUES('d10f2026-1029-4000-8000-000000000001','D1 migration test — not public','d1-migration-test-20261029','trade_company','draft','active',true,false,'hide_contact');
INSERT INTO public.organization_members(id,organization_id,user_id,role)
VALUES('d10f2026-1029-4000-8000-000000000002','d10f2026-1029-4000-8000-000000000001','aa1265f5-5298-4ec9-9292-93faa40a7272','owner');
INSERT INTO public.trade_trials(organization_id,started_by,started_at,ends_at,source)
VALUES('d10f2026-1029-4000-8000-000000000001','aa1265f5-5298-4ec9-9292-93faa40a7272',now(),now()+interval '30 minutes','admin');
DO $verify$ BEGIN
 IF NOT public.has_active_trade_access('aa1265f5-5298-4ec9-9292-93faa40a7272') THEN RAISE EXCEPTION 'Test trial did not grant intended access'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id='d10f2026-1029-4000-8000-000000000001' AND profile_status='draft' AND status='active' AND NOT profile_indexable AND public_contact_visibility='hide_contact') THEN RAISE EXCEPTION 'Test company is not private'; END IF;
END $verify$;
COMMIT;
-- After verification, end only this test trial early to verify immediate revocation.
-- The draft test records remain private; no deletion or credential change is proposed.
