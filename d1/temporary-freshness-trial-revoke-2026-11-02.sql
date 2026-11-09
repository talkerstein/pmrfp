-- Ends only the explicitly approved synthetic account's temporary trial.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users_profile WHERE id='aa1265f5-5298-4ec9-9292-93faa40a7272' AND email='d1-preview-20261022@example.invalid' AND primary_role='trade') OR
 NOT EXISTS(SELECT 1 FROM public.organizations WHERE id='d10f2026-1029-4000-8000-000000000001' AND slug='d1-migration-test-20261029' AND profile_status='draft' AND is_demo AND NOT profile_indexable AND public_contact_visibility='hide_contact') OR
 NOT EXISTS(SELECT 1 FROM public.trade_trials WHERE organization_id='d10f2026-1029-4000-8000-000000000001' AND started_by='aa1265f5-5298-4ec9-9292-93faa40a7272' AND source='admin') THEN RAISE EXCEPTION 'Synthetic trial boundary changed'; END IF;
END $guard$;
UPDATE public.trade_trials SET ends_at=greatest(started_at+interval '1 microsecond',least(ends_at,now()-interval '1 second'))
WHERE organization_id='d10f2026-1029-4000-8000-000000000001' AND started_by='aa1265f5-5298-4ec9-9292-93faa40a7272' AND source='admin';
DO $verify$ BEGIN
 IF public.has_active_trade_access('aa1265f5-5298-4ec9-9292-93faa40a7272') THEN RAISE EXCEPTION 'Test private access was not revoked'; END IF;
END $verify$;
COMMIT;
