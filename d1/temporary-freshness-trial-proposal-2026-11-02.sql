-- REVIEW ONLY: fifteen-minute access for the existing isolated preview account.
-- Reuses its private draft demo company and expired admin trial. No new users,
-- customer records, subscriptions, Stripe objects, credentials or charges.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $guard$ BEGIN
 IF '__APPROVE_D1_FRESHNESS_TRIAL_20261102__' <> 'approved-d1-freshness-trial-v1' THEN RAISE EXCEPTION 'Temporary private-data access requires approval'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users_profile WHERE id='aa1265f5-5298-4ec9-9292-93faa40a7272' AND email='d1-preview-20261022@example.invalid' AND primary_role='trade' AND status='active') THEN RAISE EXCEPTION 'Synthetic account does not match'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id='d10f2026-1029-4000-8000-000000000001' AND slug='d1-migration-test-20261029' AND organization_type='trade_company' AND profile_status='draft' AND status='active' AND is_demo AND NOT profile_indexable AND public_contact_visibility='hide_contact') THEN RAISE EXCEPTION 'Existing test company is not private'; END IF;
 IF (SELECT count(*) FROM public.organization_members WHERE user_id='aa1265f5-5298-4ec9-9292-93faa40a7272')<>1 OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE id='d10f2026-1029-4000-8000-000000000002' AND organization_id='d10f2026-1029-4000-8000-000000000001' AND user_id='aa1265f5-5298-4ec9-9292-93faa40a7272' AND role='owner') THEN RAISE EXCEPTION 'Test membership changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trade_trials WHERE organization_id='d10f2026-1029-4000-8000-000000000001' AND started_by='aa1265f5-5298-4ec9-9292-93faa40a7272' AND source='admin' AND ends_at<now() AND started_at<now() AND started_at>now()-interval '30 days') OR public.has_active_trade_access('aa1265f5-5298-4ec9-9292-93faa40a7272') THEN RAISE EXCEPTION 'Expected an expired isolated test trial'; END IF;
END $guard$;
UPDATE public.trade_trials SET ends_at=now()+interval '15 minutes'
WHERE organization_id='d10f2026-1029-4000-8000-000000000001' AND started_by='aa1265f5-5298-4ec9-9292-93faa40a7272' AND source='admin';
DO $verify$ BEGIN
 IF NOT public.has_active_trade_access('aa1265f5-5298-4ec9-9292-93faa40a7272') THEN RAISE EXCEPTION 'Test access was not granted'; END IF;
END $verify$;
COMMIT;
-- End only this test trial early after verification and check immediate denial.
