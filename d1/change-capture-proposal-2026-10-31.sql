-- REVIEW ONLY: installing this adds source-side change metadata writes and a narrow ACK permission.
-- Existing application rows, Auth credentials, grants, policies and functions are not rewritten.
-- At-least-once queue: poll ALL unacknowledged events; never advance an ID watermark.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $timeout$ BEGIN
 IF current_setting('transaction_timeout',true) IS NOT NULL THEN PERFORM set_config('transaction_timeout','30s',true); END IF;
END $timeout$;
DO $preflight$
DECLARE actual jsonb;
BEGIN
 IF '__APPROVE_D1_CHANGE_CAPTURE_20261031__' <> 'approved-d1-change-capture-v1' THEN
  RAISE EXCEPTION 'Review-only change capture: explicit approval required';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='d1_migration') THEN
  RAISE EXCEPTION 'Existing migration schema requires separate review';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='d1_migration_reader_20261022' AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolbypassrls AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<='2026-11-05 10:00:00+00'::timestamptz) THEN
  RAISE EXCEPTION 'Reader boundary or expiry changed';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='d1_migration_reader_20261022')) OR
 EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND (NOT has_table_privilege('d1_migration_reader_20261022',format('%I.%I',schemaname,tablename),'SELECT') OR has_table_privilege('d1_migration_reader_20261022',format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN
  RAISE EXCEPTION 'Reader application permissions changed';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('d1_migration_reader_20261022',p.oid,'EXECUTE') AND p.proname NOT IN ('has_active_trade_access','has_intel_access','is_admin','is_org_member')) THEN
  RAISE EXCEPTION 'Unexpected inherited definer execution';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('table',tablename,'pk',keys) ORDER BY tablename) INTO actual FROM (
  SELECT t.tablename,(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.conrelid=format('%I.%I',t.schemaname,t.tablename)::regclass AND c.contype='p') AS keys
  FROM pg_tables t WHERE t.schemaname='public'
 ) audited;
 IF actual IS DISTINCT FROM '[{"pk":["id"],"table":"audit_logs"},{"pk":["id"],"table":"award_history"},{"pk":["day","kind","slug","referrer"],"table":"badge_hits"},{"pk":["organization_id"],"table":"badge_rewards"},{"pk":["id"],"table":"bid_results"},{"pk":["domain"],"table":"blocked_domains"},{"pk":["id"],"table":"buyer_claims"},{"pk":["id"],"table":"buyer_domains"},{"pk":["user_id","buyer_slug"],"table":"buyer_follows"},{"pk":["buyer_key"],"table":"buyer_pages"},{"pk":["buyer_slug"],"table":"buyer_permissions"},{"pk":["id"],"table":"buyer_source_requests"},{"pk":["id"],"table":"case_studies"},{"pk":["id"],"table":"case_study_share_links"},{"pk":["id"],"table":"contact_requests"},{"pk":["id"],"table":"contractor_activity"},{"pk":["id"],"table":"correction_requests"},{"pk":["id"],"table":"device_push_tokens"},{"pk":["id"],"table":"digest_subscribers"},{"pk":["id"],"table":"duplicate_reviews"},{"pk":["id"],"table":"email_consents"},{"pk":["email_key"],"table":"email_suppressions"},{"pk":["id"],"table":"forum_categories"},{"pk":["category_id","user_id"],"table":"forum_category_mods"},{"pk":["old_slug"],"table":"forum_category_redirects"},{"pk":["id"],"table":"forum_mod_log"},{"pk":["id"],"table":"forum_poll_options"},{"pk":["poll_id","user_id"],"table":"forum_poll_votes"},{"pk":["id"],"table":"forum_polls"},{"pk":["post_id","user_id"],"table":"forum_post_votes"},{"pk":["id"],"table":"forum_posts"},{"pk":["user_id"],"table":"forum_profiles"},{"pk":["user_id","thread_id"],"table":"forum_reply_notifications"},{"pk":["id"],"table":"forum_reports"},{"pk":["id"],"table":"forum_reputation_events"},{"pk":["user_id","category_id"],"table":"forum_room_follows"},{"pk":["thread_id","user_id"],"table":"forum_thread_ratings"},{"pk":["id"],"table":"forum_threads"},{"pk":["user_id","week"],"table":"insight_brief_log"},{"pk":["id"],"table":"insight_rejections"},{"pk":["organization_id"],"table":"intel_access"},{"pk":["id"],"table":"job_applications"},{"pk":["id"],"table":"job_posts"},{"pk":["id"],"table":"karma_events"},{"pk":["day","channel","landing_path"],"table":"landing_counts"},{"pk":["user_id","lead_key"],"table":"lead_alert_log"},{"pk":["id"],"table":"lifecycle_sends"},{"pk":["id"],"table":"major_projects"},{"pk":["id"],"table":"marketplace_listings"},{"pk":["id"],"table":"marketplace_messages"},{"pk":["user_id"],"table":"notification_preferences"},{"pk":["id"],"table":"notifications"},{"pk":["user_id","step"],"table":"onboarding_steps"},{"pk":["source"],"table":"open_data_runs"},{"pk":["org_id"],"table":"org_karma"},{"pk":["org_id","day"],"table":"org_link_clicks"},{"pk":["id"],"table":"organization_categories"},{"pk":["id"],"table":"organization_join_requests"},{"pk":["id"],"table":"organization_members"},{"pk":["id"],"table":"organization_property_types"},{"pk":["id"],"table":"organization_regions"},{"pk":["organization_id"],"table":"organization_risk"},{"pk":["id"],"table":"organizations"},{"pk":["id"],"table":"permit_leads"},{"pk":["id"],"table":"planned_procurements"},{"pk":["id"],"table":"platform_settings"},{"pk":["id"],"table":"profile_views"},{"pk":["id"],"table":"property_types"},{"pk":["key","window_start"],"table":"rate_limit_hits"},{"pk":["id"],"table":"region_requests"},{"pk":["id"],"table":"regional_waitlist"},{"pk":["id"],"table":"regions"},{"pk":["id"],"table":"resources"},{"pk":["id"],"table":"review_invites"},{"pk":["rfp_id"],"table":"rfp_bid_checks"},{"pk":["id"],"table":"rfp_categories"},{"pk":["id"],"table":"rfp_changes"},{"pk":["id"],"table":"rfp_documents"},{"pk":["id"],"table":"rfp_interests"},{"pk":["id"],"table":"rfp_posts"},{"pk":["id"],"table":"rfp_views"},{"pk":["id"],"table":"saved_rfps"},{"pk":["user_id"],"table":"signup_attribution"},{"pk":["id"],"table":"site_events"},{"pk":["day","path","country"],"table":"site_page_views"},{"pk":["day","referrer_host","country"],"table":"site_referrers"},{"pk":["day","visitor_hash"],"table":"site_visitors"},{"pk":["day","sponsor","placement","trade","region"],"table":"sponsor_clicks"},{"pk":["day","sponsor","placement","trade","region"],"table":"sponsor_impressions"},{"pk":["id"],"table":"sponsors"},{"pk":["id"],"table":"stripe_webhook_events"},{"pk":["id"],"table":"subscriptions"},{"pk":["id"],"table":"talent_contacts"},{"pk":["id"],"table":"talent_endorsements"},{"pk":["user_id"],"table":"talent_private"},{"pk":["user_id"],"table":"talent_profiles"},{"pk":["id"],"table":"town_invites"},{"pk":["id"],"table":"town_job_addenda"},{"pk":["id"],"table":"town_job_log"},{"pk":["id"],"table":"town_job_questions"},{"pk":["rfp_id"],"table":"town_job_results"},{"pk":["id"],"table":"trade_categories"},{"pk":["organization_id"],"table":"trade_trials"},{"pk":["owner_id","organization_id"],"table":"trusted_list_items"},{"pk":["owner_id"],"table":"trusted_lists"},{"pk":["id"],"table":"users_profile"},{"pk":["id"],"table":"vendor_reviews"},{"pk":["id"],"table":"winner_claims"}]'::jsonb THEN RAISE EXCEPTION 'Source table/primary-key inventory changed'; END IF;
END $preflight$;
LOCK TABLE public."audit_logs",public."award_history",public."badge_hits",public."badge_rewards",public."bid_results",public."blocked_domains",public."buyer_claims",public."buyer_domains",public."buyer_follows",public."buyer_pages",public."buyer_permissions",public."buyer_source_requests",public."case_studies",public."case_study_share_links",public."contact_requests",public."contractor_activity",public."correction_requests",public."device_push_tokens",public."digest_subscribers",public."duplicate_reviews",public."email_consents",public."email_suppressions",public."forum_categories",public."forum_category_mods",public."forum_category_redirects",public."forum_mod_log",public."forum_poll_options",public."forum_poll_votes",public."forum_polls",public."forum_post_votes",public."forum_posts",public."forum_profiles",public."forum_reply_notifications",public."forum_reports",public."forum_reputation_events",public."forum_room_follows",public."forum_thread_ratings",public."forum_threads",public."insight_brief_log",public."insight_rejections",public."intel_access",public."job_applications",public."job_posts",public."karma_events",public."landing_counts",public."lead_alert_log",public."lifecycle_sends",public."major_projects",public."marketplace_listings",public."marketplace_messages",public."notification_preferences",public."notifications",public."onboarding_steps",public."open_data_runs",public."org_karma",public."org_link_clicks",public."organization_categories",public."organization_join_requests",public."organization_members",public."organization_property_types",public."organization_regions",public."organization_risk",public."organizations",public."permit_leads",public."planned_procurements",public."platform_settings",public."profile_views",public."property_types",public."rate_limit_hits",public."region_requests",public."regional_waitlist",public."regions",public."resources",public."review_invites",public."rfp_bid_checks",public."rfp_categories",public."rfp_changes",public."rfp_documents",public."rfp_interests",public."rfp_posts",public."rfp_views",public."saved_rfps",public."signup_attribution",public."site_events",public."site_page_views",public."site_referrers",public."site_visitors",public."sponsor_clicks",public."sponsor_impressions",public."sponsors",public."stripe_webhook_events",public."subscriptions",public."talent_contacts",public."talent_endorsements",public."talent_private",public."talent_profiles",public."town_invites",public."town_job_addenda",public."town_job_log",public."town_job_questions",public."town_job_results",public."trade_categories",public."trade_trials",public."trusted_list_items",public."trusted_lists",public."users_profile",public."vendor_reviews",public."winner_claims" IN SHARE ROW EXCLUSIVE MODE NOWAIT;
CREATE SCHEMA d1_migration;
COMMENT ON SCHEMA d1_migration IS 'pmrfp-d1-change-capture-v1; reviewed 2026-10-31';
REVOKE ALL ON SCHEMA d1_migration FROM PUBLIC;
CREATE TABLE d1_migration.registered_tables(table_name text PRIMARY KEY,pk_columns text[] NOT NULL);
CREATE TABLE d1_migration.outbox(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 table_name text NOT NULL REFERENCES d1_migration.registered_tables(table_name),
 operation text NOT NULL CHECK(operation IN ('upsert','delete','truncate')),
 key jsonb NOT NULL CHECK(jsonb_typeof(key)='object'),
 source_txid bigint NOT NULL DEFAULT txid_current(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 acknowledged_at timestamptz,
 destination_sha256 text CHECK(destination_sha256 ~ '^[a-f0-9]{64}$'),
 CHECK((acknowledged_at IS NULL)=(destination_sha256 IS NULL)),
 CHECK((operation='truncate' AND key='{}'::jsonb) OR (operation<>'truncate' AND key<>'{}'::jsonb))
);
CREATE INDEX outbox_pending_idx ON d1_migration.outbox(id) WHERE acknowledged_at IS NULL;
CREATE INDEX outbox_pending_table_idx ON d1_migration.outbox(table_name,id) WHERE acknowledged_at IS NULL;
ALTER TABLE d1_migration.registered_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE d1_migration.outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA d1_migration FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA d1_migration FROM PUBLIC;
GRANT USAGE ON SCHEMA d1_migration TO d1_migration_reader_20261022;
GRANT SELECT ON d1_migration.registered_tables,d1_migration.outbox TO d1_migration_reader_20261022;
INSERT INTO d1_migration.registered_tables VALUES('audit_logs',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('award_history',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('badge_hits',ARRAY['day','kind','slug','referrer']);
INSERT INTO d1_migration.registered_tables VALUES('badge_rewards',ARRAY['organization_id']);
INSERT INTO d1_migration.registered_tables VALUES('bid_results',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('blocked_domains',ARRAY['domain']);
INSERT INTO d1_migration.registered_tables VALUES('buyer_claims',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('buyer_domains',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('buyer_follows',ARRAY['user_id','buyer_slug']);
INSERT INTO d1_migration.registered_tables VALUES('buyer_pages',ARRAY['buyer_key']);
INSERT INTO d1_migration.registered_tables VALUES('buyer_permissions',ARRAY['buyer_slug']);
INSERT INTO d1_migration.registered_tables VALUES('buyer_source_requests',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('case_studies',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('case_study_share_links',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('contact_requests',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('contractor_activity',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('correction_requests',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('device_push_tokens',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('digest_subscribers',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('duplicate_reviews',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('email_consents',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('email_suppressions',ARRAY['email_key']);
INSERT INTO d1_migration.registered_tables VALUES('forum_categories',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_category_mods',ARRAY['category_id','user_id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_category_redirects',ARRAY['old_slug']);
INSERT INTO d1_migration.registered_tables VALUES('forum_mod_log',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_poll_options',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_poll_votes',ARRAY['poll_id','user_id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_polls',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_post_votes',ARRAY['post_id','user_id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_posts',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_profiles',ARRAY['user_id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_reply_notifications',ARRAY['user_id','thread_id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_reports',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_reputation_events',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_room_follows',ARRAY['user_id','category_id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_thread_ratings',ARRAY['thread_id','user_id']);
INSERT INTO d1_migration.registered_tables VALUES('forum_threads',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('insight_brief_log',ARRAY['user_id','week']);
INSERT INTO d1_migration.registered_tables VALUES('insight_rejections',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('intel_access',ARRAY['organization_id']);
INSERT INTO d1_migration.registered_tables VALUES('job_applications',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('job_posts',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('karma_events',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('landing_counts',ARRAY['day','channel','landing_path']);
INSERT INTO d1_migration.registered_tables VALUES('lead_alert_log',ARRAY['user_id','lead_key']);
INSERT INTO d1_migration.registered_tables VALUES('lifecycle_sends',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('major_projects',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('marketplace_listings',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('marketplace_messages',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('notification_preferences',ARRAY['user_id']);
INSERT INTO d1_migration.registered_tables VALUES('notifications',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('onboarding_steps',ARRAY['user_id','step']);
INSERT INTO d1_migration.registered_tables VALUES('open_data_runs',ARRAY['source']);
INSERT INTO d1_migration.registered_tables VALUES('org_karma',ARRAY['org_id']);
INSERT INTO d1_migration.registered_tables VALUES('org_link_clicks',ARRAY['org_id','day']);
INSERT INTO d1_migration.registered_tables VALUES('organization_categories',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('organization_join_requests',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('organization_members',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('organization_property_types',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('organization_regions',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('organization_risk',ARRAY['organization_id']);
INSERT INTO d1_migration.registered_tables VALUES('organizations',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('permit_leads',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('planned_procurements',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('platform_settings',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('profile_views',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('property_types',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('rate_limit_hits',ARRAY['key','window_start']);
INSERT INTO d1_migration.registered_tables VALUES('region_requests',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('regional_waitlist',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('regions',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('resources',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('review_invites',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('rfp_bid_checks',ARRAY['rfp_id']);
INSERT INTO d1_migration.registered_tables VALUES('rfp_categories',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('rfp_changes',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('rfp_documents',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('rfp_interests',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('rfp_posts',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('rfp_views',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('saved_rfps',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('signup_attribution',ARRAY['user_id']);
INSERT INTO d1_migration.registered_tables VALUES('site_events',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('site_page_views',ARRAY['day','path','country']);
INSERT INTO d1_migration.registered_tables VALUES('site_referrers',ARRAY['day','referrer_host','country']);
INSERT INTO d1_migration.registered_tables VALUES('site_visitors',ARRAY['day','visitor_hash']);
INSERT INTO d1_migration.registered_tables VALUES('sponsor_clicks',ARRAY['day','sponsor','placement','trade','region']);
INSERT INTO d1_migration.registered_tables VALUES('sponsor_impressions',ARRAY['day','sponsor','placement','trade','region']);
INSERT INTO d1_migration.registered_tables VALUES('sponsors',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('stripe_webhook_events',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('subscriptions',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('talent_contacts',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('talent_endorsements',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('talent_private',ARRAY['user_id']);
INSERT INTO d1_migration.registered_tables VALUES('talent_profiles',ARRAY['user_id']);
INSERT INTO d1_migration.registered_tables VALUES('town_invites',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('town_job_addenda',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('town_job_log',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('town_job_questions',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('town_job_results',ARRAY['rfp_id']);
INSERT INTO d1_migration.registered_tables VALUES('trade_categories',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('trade_trials',ARRAY['organization_id']);
INSERT INTO d1_migration.registered_tables VALUES('trusted_list_items',ARRAY['owner_id','organization_id']);
INSERT INTO d1_migration.registered_tables VALUES('trusted_lists',ARRAY['owner_id']);
INSERT INTO d1_migration.registered_tables VALUES('users_profile',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('vendor_reviews',ARRAY['id']);
INSERT INTO d1_migration.registered_tables VALUES('winner_claims',ARRAY['id']);
CREATE FUNCTION d1_migration.capture_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $capture$
DECLARE keys text[]; old_key jsonb; new_key jsonb;
BEGIN
 IF pg_trigger_depth()=0 OR TG_TABLE_SCHEMA<>'public' THEN RAISE EXCEPTION 'Trigger invocation required'; END IF;
 SELECT pk_columns INTO keys FROM d1_migration.registered_tables WHERE table_name=TG_TABLE_NAME;
 IF keys IS NULL THEN RAISE EXCEPTION 'Unregistered source table'; END IF;
 IF TG_OP='UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
 IF TG_OP IN ('UPDATE','DELETE') THEN
  SELECT jsonb_object_agg(k,to_jsonb(OLD)->k) INTO old_key FROM unnest(keys) k;
 END IF;
 IF TG_OP IN ('UPDATE','INSERT') THEN
  SELECT jsonb_object_agg(k,to_jsonb(NEW)->k) INTO new_key FROM unnest(keys) k;
 END IF;
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND old_key IS DISTINCT FROM new_key) THEN
  INSERT INTO d1_migration.outbox(table_name,operation,key) VALUES(TG_TABLE_NAME,'delete',old_key);
 END IF;
 IF TG_OP<>'DELETE' THEN
  INSERT INTO d1_migration.outbox(table_name,operation,key) VALUES(TG_TABLE_NAME,'upsert',new_key);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $capture$;
CREATE FUNCTION d1_migration.capture_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $capture$
BEGIN
 IF pg_trigger_depth()=0 OR TG_TABLE_SCHEMA<>'public' OR TG_OP<>'TRUNCATE' THEN RAISE EXCEPTION 'Truncate trigger invocation required'; END IF;
 INSERT INTO d1_migration.outbox(table_name,operation,key) VALUES(TG_TABLE_NAME,'truncate','{}'::jsonb);
 RETURN NULL;
END $capture$;
CREATE FUNCTION d1_migration.acknowledge(p_ids bigint[],p_destination_sha256 text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $ack$
DECLARE affected integer;
BEGIN
 IF clock_timestamp()>='2026-11-05 10:00:00+00'::timestamptz THEN RAISE EXCEPTION 'Change acknowledgement window expired'; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)<1 OR cardinality(p_ids)>500 OR p_destination_sha256 IS NULL OR p_destination_sha256 !~ '^[a-f0-9]{64}$' OR
 EXISTS(SELECT 1 FROM unnest(p_ids) i WHERE i IS NULL OR i<1) OR
 (SELECT count(DISTINCT i) FROM unnest(p_ids) i)<>cardinality(p_ids) THEN RAISE EXCEPTION 'Invalid bounded acknowledgement'; END IF;
 IF (SELECT count(*) FROM d1_migration.outbox WHERE id=ANY(p_ids))<>cardinality(p_ids) THEN RAISE EXCEPTION 'Unknown acknowledgement IDs'; END IF;
 UPDATE d1_migration.outbox SET acknowledged_at=clock_timestamp(),destination_sha256=p_destination_sha256 WHERE id=ANY(p_ids) AND acknowledged_at IS NULL;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END $ack$;
REVOKE ALL ON FUNCTION d1_migration.capture_row(),d1_migration.capture_truncate(),d1_migration.acknowledge(bigint[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION d1_migration.acknowledge(bigint[],text) TO d1_migration_reader_20261022;
DO $install$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['audit_logs','award_history','badge_hits','badge_rewards','bid_results','blocked_domains','buyer_claims','buyer_domains','buyer_follows','buyer_pages','buyer_permissions','buyer_source_requests','case_studies','case_study_share_links','contact_requests','contractor_activity','correction_requests','device_push_tokens','digest_subscribers','duplicate_reviews','email_consents','email_suppressions','forum_categories','forum_category_mods','forum_category_redirects','forum_mod_log','forum_poll_options','forum_poll_votes','forum_polls','forum_post_votes','forum_posts','forum_profiles','forum_reply_notifications','forum_reports','forum_reputation_events','forum_room_follows','forum_thread_ratings','forum_threads','insight_brief_log','insight_rejections','intel_access','job_applications','job_posts','karma_events','landing_counts','lead_alert_log','lifecycle_sends','major_projects','marketplace_listings','marketplace_messages','notification_preferences','notifications','onboarding_steps','open_data_runs','org_karma','org_link_clicks','organization_categories','organization_join_requests','organization_members','organization_property_types','organization_regions','organization_risk','organizations','permit_leads','planned_procurements','platform_settings','profile_views','property_types','rate_limit_hits','region_requests','regional_waitlist','regions','resources','review_invites','rfp_bid_checks','rfp_categories','rfp_changes','rfp_documents','rfp_interests','rfp_posts','rfp_views','saved_rfps','signup_attribution','site_events','site_page_views','site_referrers','site_visitors','sponsor_clicks','sponsor_impressions','sponsors','stripe_webhook_events','subscriptions','talent_contacts','talent_endorsements','talent_private','talent_profiles','town_invites','town_job_addenda','town_job_log','town_job_questions','town_job_results','trade_categories','trade_trials','trusted_list_items','trusted_lists','users_profile','vendor_reviews','winner_claims'] LOOP
  EXECUTE format('CREATE TRIGGER d1_migration_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION d1_migration.capture_row()',t);
  EXECUTE format('CREATE TRIGGER d1_migration_truncate AFTER TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION d1_migration.capture_truncate()',t);
 END LOOP;
END $install$;
COMMIT;

