-- STAGING COPY ONLY. No RLS, RPCs, views or application triggers are provided.

PRAGMA foreign_keys=ON;

CREATE TABLE "_auth_users" ("id" TEXT NOT NULL PRIMARY KEY);

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "metadata" TEXT CHECK ("metadata" IS NULL OR json_valid("metadata")),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id)
);

CREATE TABLE "case_studies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "submitted_by_user_id" TEXT,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category_id" TEXT,
  "region_id" TEXT,
  "property_type" TEXT,
  "city" TEXT,
  "province" TEXT,
  "challenge" TEXT NOT NULL,
  "approach" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "timeline" TEXT,
  "budget_band" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "admin_notes" TEXT,
  "published_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "photos" TEXT NOT NULL DEFAULT '[]' CHECK ("photos" IS NULL OR json_valid("photos")),
  "hero_url" TEXT,
  "summary" TEXT,
  "source" TEXT NOT NULL DEFAULT 'form',
  "client_approved" INTEGER NOT NULL DEFAULT 0 CHECK ("client_approved" IN (0,1)),
  "visibility" TEXT NOT NULL DEFAULT 'public',
  "client_type" TEXT,
  "scope" TEXT,
  "results" TEXT NOT NULL DEFAULT '[]' CHECK ("results" IS NULL OR json_valid("results")),
  "started_on" TEXT,
  "completed_on" TEXT,
  "ai_assisted" INTEGER NOT NULL DEFAULT 0 CHECK ("ai_assisted" IN (0,1)),
  CONSTRAINT "case_studies_category_id_fkey" FOREIGN KEY (category_id) REFERENCES trade_categories(id) ON DELETE SET NULL,
  CONSTRAINT "case_studies_client_type_check" CHECK ((client_type IN ('property_manager', 'condo_board', 'commercial_landlord', 'housing_provider', 'public_sector', 'general_contractor', 'business_owner', 'other'))),
  CONSTRAINT "case_studies_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "case_studies_photos_check" CHECK ((json_type(photos) = 'array')),
  CONSTRAINT "case_studies_pkey" PRIMARY KEY (id),
  CONSTRAINT "case_studies_region_id_fkey" FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL,
  CONSTRAINT "case_studies_results_check" CHECK (((json_type(results) = 'array') AND (json_array_length(results) <= 4))),
  CONSTRAINT "case_studies_slug_key" UNIQUE (slug),
  CONSTRAINT "case_studies_source_check" CHECK ((source IN ('form', 'capture'))),
  CONSTRAINT "case_studies_status_check" CHECK ((status IN ('draft', 'pending_review', 'published', 'rejected', 'archived'))),
  CONSTRAINT "case_studies_submitted_by_user_id_fkey" FOREIGN KEY (submitted_by_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "case_studies_visibility_check" CHECK ((visibility IN ('public', 'unlisted', 'private')))
);

CREATE TABLE "case_study_share_links" (
  "id" TEXT NOT NULL,
  "case_study_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "label" TEXT,
  "created_by_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "revoked_at" TEXT,
  "last_viewed_at" TEXT,
  "view_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "case_study_share_links_case_study_id_fkey" FOREIGN KEY (case_study_id) REFERENCES case_studies(id) ON DELETE CASCADE,
  CONSTRAINT "case_study_share_links_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "case_study_share_links_label_check" CHECK (((label IS NULL) OR (length(label) <= 80))),
  CONSTRAINT "case_study_share_links_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "case_study_share_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "case_study_share_links_token_key" UNIQUE (token)
);

CREATE TABLE "contact_requests" (
  "id" TEXT NOT NULL,
  "request_type" TEXT NOT NULL DEFAULT 'general_contact',
  "requester_name" TEXT,
  "requester_email" TEXT,
  "requester_phone" TEXT,
  "requester_organization" TEXT,
  "target_organization_id" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "contact_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "contact_requests_request_type_check" CHECK ((request_type IN ('directory_intro', 'property_manager_help', 'general_contact', 'vendor_question'))),
  CONSTRAINT "contact_requests_status_check" CHECK ((status IN ('new', 'contacted', 'closed', 'spam'))),
  CONSTRAINT "contact_requests_target_organization_id_fkey" FOREIGN KEY (target_organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE TABLE "device_push_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "last_seen_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "device_push_tokens_platform_check" CHECK ((platform IN ('ios', 'android', 'web'))),
  CONSTRAINT "device_push_tokens_token_key" UNIQUE (token),
  CONSTRAINT "device_push_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE CASCADE
);

CREATE TABLE "forum_categories" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "is_public" INTEGER NOT NULL DEFAULT 1 CHECK ("is_public" IN (0,1)),
  "thread_count" INTEGER NOT NULL DEFAULT 0,
  "post_count" INTEGER NOT NULL DEFAULT 0,
  "last_post_at" TEXT,
  "last_thread_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "forum_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "forum_categories_slug_key" UNIQUE (slug)
);

CREATE TABLE "forum_category_mods" (
  "category_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'mod',
  "appointed_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "forum_category_mods_category_id_fkey" FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE CASCADE,
  CONSTRAINT "forum_category_mods_pkey" PRIMARY KEY (category_id, user_id),
  CONSTRAINT "forum_category_mods_role_check" CHECK ((role = 'mod')),
  CONSTRAINT "forum_category_mods_user_id_fkey" FOREIGN KEY (user_id) REFERENCES forum_profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE "forum_mod_log" (
  "id" TEXT NOT NULL,
  "mod_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "forum_mod_log_pkey" PRIMARY KEY (id)
);

CREATE TABLE "forum_post_votes" (
  "post_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "forum_post_votes_pkey" PRIMARY KEY (post_id, user_id),
  CONSTRAINT "forum_post_votes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  CONSTRAINT "forum_post_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT "forum_post_votes_value_check" CHECK ((value = 1))
);

CREATE TABLE "forum_posts" (
  "id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "body_words" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'approved',
  "is_staff" INTEGER NOT NULL DEFAULT 0 CHECK ("is_staff" IN (0,1)),
  "upvote_count" INTEGER NOT NULL DEFAULT 0,
  "is_accepted" INTEGER NOT NULL DEFAULT 0 CHECK ("is_accepted" IN (0,1)),
  "flag_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "edited_at" TEXT,
  CONSTRAINT "forum_posts_author_fkey" FOREIGN KEY (author_id) REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT "forum_posts_body_check" CHECK (((length(body) >= 2) AND (length(body) <= 10000))),
  CONSTRAINT "forum_posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "forum_posts_status_check" CHECK ((status IN ('held', 'approved', 'hidden'))),
  CONSTRAINT "forum_posts_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE
);

CREATE TABLE "forum_profiles" (
  "user_id" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "trade" TEXT,
  "region" TEXT,
  "bio" TEXT,
  "organization_id" TEXT,
  "reputation" INTEGER NOT NULL DEFAULT 0,
  "post_count" INTEGER NOT NULL DEFAULT 0,
  "verified_business" INTEGER NOT NULL DEFAULT 0 CHECK ("verified_business" IN (0,1)),
  "is_staff" INTEGER NOT NULL DEFAULT 0 CHECK ("is_staff" IN (0,1)),
  "banned" INTEGER NOT NULL DEFAULT 0 CHECK ("banned" IN (0,1)),
  "ban_reason" TEXT,
  "last_seen_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "is_system" INTEGER NOT NULL DEFAULT 0 CHECK ("is_system" IN (0,1)),
  CONSTRAINT "forum_profiles_bio_check" CHECK ((length(bio) <= 500)),
  CONSTRAINT "forum_profiles_display_name_check" CHECK (((length(display_name) >= 1) AND (length(display_name) <= 60))),
  CONSTRAINT "forum_profiles_handle_key" UNIQUE (handle),
  CONSTRAINT "forum_profiles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT "forum_profiles_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "forum_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "_auth_users"(id) ON DELETE CASCADE
);

CREATE TABLE "forum_reports" (
  "id" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolved_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "forum_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "forum_reports_reason_check" CHECK ((length(reason) <= 300)),
  CONSTRAINT "forum_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT "forum_reports_status_check" CHECK ((status IN ('open', 'resolved', 'dismissed'))),
  CONSTRAINT "forum_reports_target_type_check" CHECK ((target_type IN ('thread', 'post'))),
  CONSTRAINT "forum_reports_target_type_target_id_reporter_id_key" UNIQUE (target_type, target_id, reporter_id)
);

CREATE TABLE "forum_reputation_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "ref_type" TEXT NOT NULL DEFAULT '',
  "ref_id" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "forum_reputation_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "forum_reputation_events_user_id_event_ref_type_ref_id_key" UNIQUE (user_id, event, ref_type, ref_id),
  CONSTRAINT "forum_reputation_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES forum_profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE "forum_thread_ratings" (
  "thread_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "forum_thread_ratings_pkey" PRIMARY KEY (thread_id, user_id),
  CONSTRAINT "forum_thread_ratings_score_check" CHECK (((score >= 1) AND (score <= 5))),
  CONSTRAINT "forum_thread_ratings_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
  CONSTRAINT "forum_thread_ratings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES forum_profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE "forum_threads" (
  "id" TEXT NOT NULL,
  "short_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "body_words" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'approved',
  "is_pinned" INTEGER NOT NULL DEFAULT 0 CHECK ("is_pinned" IN (0,1)),
  "is_locked" INTEGER NOT NULL DEFAULT 0 CHECK ("is_locked" IN (0,1)),
  "is_staff" INTEGER NOT NULL DEFAULT 0 CHECK ("is_staff" IN (0,1)),
  "accepted_post_id" TEXT,
  "reply_count" INTEGER NOT NULL DEFAULT 0,
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "rating_sum" INTEGER NOT NULL DEFAULT 0,
  "rating_count" INTEGER NOT NULL DEFAULT 0,
  "words_total" INTEGER NOT NULL DEFAULT 0,
  "flag_count" INTEGER NOT NULL DEFAULT 0,
  "region" TEXT,
  "last_post_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "last_post_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "auto_source" TEXT,
  "auto_source_key" TEXT,
  CONSTRAINT "forum_threads_accepted_fkey" FOREIGN KEY (accepted_post_id) REFERENCES forum_posts(id) ON DELETE SET NULL,
  CONSTRAINT "forum_threads_author_fkey" FOREIGN KEY (author_id) REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT "forum_threads_auto_source_check" CHECK (((auto_source IS NULL) OR (auto_source IN ('tender', 'award', 'rfp')))),
  CONSTRAINT "forum_threads_body_check" CHECK (((length(body) >= 20) AND (length(body) <= 10000))),
  CONSTRAINT "forum_threads_category_id_fkey" FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE RESTRICT,
  CONSTRAINT "forum_threads_last_user_fkey" FOREIGN KEY (last_post_user_id) REFERENCES forum_profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT "forum_threads_pkey" PRIMARY KEY (id),
  CONSTRAINT "forum_threads_short_id_key" UNIQUE (short_id),
  CONSTRAINT "forum_threads_status_check" CHECK ((status IN ('held', 'approved', 'hidden'))),
  CONSTRAINT "forum_threads_title_check" CHECK (((length(title) >= 8) AND (length(title) <= 140))),
  CONSTRAINT "forum_threads_type_check" CHECK ((type IN ('question', 'discussion')))
);

CREATE TABLE "job_applications" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "experience_years" INTEGER,
  "certifications" TEXT,
  "message" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "job_applications_certifications_check" CHECK ((length(certifications) <= 500)),
  CONSTRAINT "job_applications_email_check" CHECK ((length(email) <= 120)),
  CONSTRAINT "job_applications_experience_years_check" CHECK (((experience_years >= 0) AND (experience_years <= 60))),
  CONSTRAINT "job_applications_job_id_fkey" FOREIGN KEY (job_id) REFERENCES job_posts(id) ON DELETE CASCADE,
  CONSTRAINT "job_applications_message_check" CHECK ((length(message) <= 2000)),
  CONSTRAINT "job_applications_name_check" CHECK (((length(name) >= 2) AND (length(name) <= 80))),
  CONSTRAINT "job_applications_phone_check" CHECK ((length(phone) <= 30)),
  CONSTRAINT "job_applications_pkey" PRIMARY KEY (id)
);

CREATE TABLE "job_posts" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "posted_by" TEXT,
  "title" TEXT NOT NULL,
  "category_id" TEXT,
  "region_id" TEXT,
  "city" TEXT NOT NULL,
  "employment_type" TEXT NOT NULL,
  "pay_min" TEXT,
  "pay_max" TEXT,
  "pay_unit" TEXT,
  "description" TEXT NOT NULL,
  "requirements" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "job_posts_category_id_fkey" FOREIGN KEY (category_id) REFERENCES trade_categories(id) ON DELETE SET NULL,
  CONSTRAINT "job_posts_city_check" CHECK (((length(city) >= 2) AND (length(city) <= 80))),
  CONSTRAINT "job_posts_description_check" CHECK (((length(description) >= 40) AND (length(description) <= 5000))),
  CONSTRAINT "job_posts_employment_type_check" CHECK ((employment_type IN ('full_time', 'part_time', 'contract', 'seasonal', 'apprenticeship', 'temporary'))),
  CONSTRAINT "job_posts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "job_posts_pay_max_check" CHECK (((pay_max IS NULL) OR (pay_max >= (0)))),
  CONSTRAINT "job_posts_pay_min_check" CHECK (((pay_min IS NULL) OR (pay_min >= (0)))),
  CONSTRAINT "job_posts_pay_unit_check" CHECK ((pay_unit IN ('hour', 'day', 'year', 'project'))),
  CONSTRAINT "job_posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "job_posts_posted_by_fkey" FOREIGN KEY (posted_by) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "job_posts_region_id_fkey" FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL,
  CONSTRAINT "job_posts_requirements_check" CHECK ((length(requirements) <= 3000)),
  CONSTRAINT "job_posts_slug_key" UNIQUE (slug),
  CONSTRAINT "job_posts_status_check" CHECK ((status IN ('open', 'closed'))),
  CONSTRAINT "job_posts_title_check" CHECK (((length(title) >= 4) AND (length(title) <= 120)))
);

CREATE TABLE "karma_events" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "user_id" TEXT,
  "kind" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL DEFAULT '',
  "reason" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "recorded_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT,
  "reversed_at" TEXT,
  "reversed_reason" TEXT,
  "reversed_by" TEXT,
  CONSTRAINT "karma_admin_reason" CHECK (((kind <> 'admin_adjustment') OR (length(COALESCE(reason, '')) >= 3))),
  CONSTRAINT "karma_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "karma_events_kind_check" CHECK ((kind IN ('profile_approved', 'vendor_verified', 'forum_accepted_answer', 'forum_answer_upvote', 'forum_thread_rated', 'forum_content_removed', 'project_verified_review', 'gc_package_interest', 'gc_award_package', 'rfp_bids_received', 'referral_verified', 'admin_adjustment'))),
  CONSTRAINT "karma_events_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "karma_events_org_id_kind_source_type_source_id_actor_id_key" UNIQUE (org_id, kind, source_type, source_id, actor_id),
  CONSTRAINT "karma_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "karma_events_points_check" CHECK (((points >= '-1000') AND (points <= 1000))),
  CONSTRAINT "karma_events_reason_check" CHECK ((length(reason) <= 500)),
  CONSTRAINT "karma_events_reversed_by_fkey" FOREIGN KEY (reversed_by) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "karma_events_reversed_reason_check" CHECK ((length(reversed_reason) <= 500)),
  CONSTRAINT "karma_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE SET NULL
);

CREATE TABLE "major_projects" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "source_key" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'CA',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'other',
  "owner" TEXT,
  "city" TEXT,
  "province" TEXT,
  "region_id" TEXT,
  "est_value_cad" TEXT,
  "size" TEXT,
  "status" TEXT NOT NULL DEFAULT 'unknown',
  "status_raw" TEXT,
  "status_date" TEXT,
  "timeline" TEXT,
  "general_contractor" TEXT,
  "bid_list_url" TEXT,
  "bid_route" TEXT,
  "trades_needed" TEXT NOT NULL DEFAULT '[]' CHECK ("trades_needed" IS NULL OR json_valid("trades_needed")) CHECK (json_type("trades_needed")='array'),
  "sources" TEXT NOT NULL DEFAULT '[]' CHECK ("sources" IS NULL OR json_valid("sources")),
  "license" TEXT NOT NULL,
  "evidence" TEXT,
  "caveats" TEXT,
  "approved" INTEGER NOT NULL DEFAULT 0 CHECK ("approved" IN (0,1)),
  "review_status" TEXT NOT NULL DEFAULT 'approved',
  "reviewed_by" TEXT,
  "reviewed_at" TEXT,
  "first_seen" TEXT NOT NULL DEFAULT CURRENT_DATE,
  "last_seen" TEXT NOT NULL DEFAULT CURRENT_DATE,
  "stale" INTEGER NOT NULL DEFAULT 0 CHECK ("stale" IN (0,1)),
  "stale_since" TEXT,
  "previous_status" TEXT,
  "status_changed_at" TEXT,
  "import_fingerprint" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "source_updated" TEXT,
  "link_group" TEXT,
  CONSTRAINT "major_projects_bid_route_check" CHECK ((length(bid_route) <= 2000)),
  CONSTRAINT "major_projects_category_check" CHECK ((category IN ('commercial', 'institutional', 'industrial', 'multi_residential', 'mixed_use', 'infrastructure', 'energy', 'mining', 'oil_gas', 'data_centre', 'other'))),
  CONSTRAINT "major_projects_caveats_check" CHECK ((length(caveats) <= 2000)),
  CONSTRAINT "major_projects_city_check" CHECK ((length(city) <= 120)),
  CONSTRAINT "major_projects_country_check" CHECK ((country = 'CA')),
  CONSTRAINT "major_projects_description_check" CHECK ((length(description) <= 2000)),
  CONSTRAINT "major_projects_est_value_cad_check" CHECK (((est_value_cad IS NULL) OR (est_value_cad >= (0)))),
  CONSTRAINT "major_projects_evidence_check" CHECK (((evidence IS NULL) OR (evidence IN ('F', 'S', 'A')))),
  CONSTRAINT "major_projects_general_contractor_check" CHECK ((length(general_contractor) <= 300)),
  CONSTRAINT "major_projects_license_check" CHECK (((length(license) >= 2) AND (length(license) <= 400))),
  CONSTRAINT "major_projects_name_check" CHECK (((length(name) >= 2) AND (length(name) <= 300))),
  CONSTRAINT "major_projects_owner_check" CHECK ((length(owner) <= 300)),
  CONSTRAINT "major_projects_pkey" PRIMARY KEY (id),
  CONSTRAINT "major_projects_province_check" CHECK ((length(province) <= 60)),
  CONSTRAINT "major_projects_region_id_fkey" FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL,
  CONSTRAINT "major_projects_review_status_check" CHECK ((review_status IN ('pending', 'approved', 'rejected'))),
  CONSTRAINT "major_projects_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "major_projects_size_check" CHECK ((length(size) <= 200)),
  CONSTRAINT "major_projects_slug_key" UNIQUE (slug),
  CONSTRAINT "major_projects_source_key_check" CHECK (((length(source_key) >= 3) AND (length(source_key) <= 200))),
  CONSTRAINT "major_projects_source_key_key" UNIQUE (source_key),
  CONSTRAINT "major_projects_sources_check" CHECK ((json_type(sources) = 'array')),
  CONSTRAINT "major_projects_status_check" CHECK ((status IN ('application', 'proposed', 'approved', 'under_construction', 'completed', 'on_hold', 'cancelled', 'unknown'))),
  CONSTRAINT "major_projects_status_raw_check" CHECK ((length(status_raw) <= 200)),
  CONSTRAINT "major_projects_timeline_check" CHECK ((length(timeline) <= 500))
);

CREATE TABLE "marketplace_listings" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "condition" TEXT NOT NULL,
  "price_cents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'CAD',
  "price_on_request" INTEGER NOT NULL DEFAULT 0 CHECK ("price_on_request" IN (0,1)),
  "description" TEXT NOT NULL,
  "city" TEXT,
  "region_slug" TEXT,
  "country" TEXT NOT NULL DEFAULT 'CA',
  "photos" TEXT NOT NULL DEFAULT '[]' CHECK ("photos" IS NULL OR json_valid("photos")),
  "status" TEXT NOT NULL DEFAULT 'active',
  "featured_until" TEXT,
  "views" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "expires_at" TEXT NOT NULL,
  CONSTRAINT "marketplace_listings_category_check" CHECK ((category IN ('heavy-equipment', 'lifts', 'scaffolding', 'trailers', 'vehicles', 'power-tools', 'hand-tools', 'generators', 'compressors', 'surveying', 'safety', 'materials', 'hvac', 'plumbing', 'electrical', 'other'))),
  CONSTRAINT "marketplace_listings_city_check" CHECK ((length(city) <= 80)),
  CONSTRAINT "marketplace_listings_condition_check" CHECK ((condition IN ('new', 'like-new', 'used', 'for-parts'))),
  CONSTRAINT "marketplace_listings_country_check" CHECK ((country IN ('CA', 'US'))),
  CONSTRAINT "marketplace_listings_currency_check" CHECK ((currency IN ('CAD', 'USD'))),
  CONSTRAINT "marketplace_listings_description_check" CHECK (((length(description) >= 20) AND (length(description) <= 5000))),
  CONSTRAINT "marketplace_listings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT "marketplace_listings_photos_check" CHECK (((json_type(photos) = 'array') AND (json_array_length(photos) <= 10))),
  CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY (id),
  CONSTRAINT "marketplace_listings_price_cents_check" CHECK (((price_cents IS NULL) OR ((price_cents >= 0) AND (price_cents <= 100000000)))),
  CONSTRAINT "marketplace_listings_region_slug_check" CHECK ((length(region_slug) <= 80)),
  CONSTRAINT "marketplace_listings_slug_key" UNIQUE (slug),
  CONSTRAINT "marketplace_listings_status_check" CHECK ((status IN ('draft', 'active', 'sold', 'removed', 'expired'))),
  CONSTRAINT "marketplace_listings_title_check" CHECK (((length(title) >= 5) AND (length(title) <= 120))),
  CONSTRAINT "marketplace_listings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "_auth_users"(id) ON DELETE CASCADE
);

CREATE TABLE "marketplace_messages" (
  "id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "sender_email" TEXT NOT NULL,
  "sender_name" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "marketplace_messages_body_check" CHECK (((length(body) >= 10) AND (length(body) <= 3000))),
  CONSTRAINT "marketplace_messages_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  CONSTRAINT "marketplace_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "marketplace_messages_sender_email_check" CHECK ((length(sender_email) <= 254)),
  CONSTRAINT "marketplace_messages_sender_name_check" CHECK ((length(sender_name) <= 120))
);

CREATE TABLE "notification_preferences" (
  "user_id" TEXT NOT NULL,
  "new_rfps" TEXT NOT NULL DEFAULT 'daily',
  "interest_updates" TEXT NOT NULL DEFAULT 'instant',
  "intro_requests" TEXT NOT NULL DEFAULT 'instant',
  "region_activation" TEXT NOT NULL DEFAULT 'instant',
  "referral_status" TEXT NOT NULL DEFAULT 'instant',
  "product_news" TEXT NOT NULL DEFAULT 'off',
  "channel_email" INTEGER NOT NULL DEFAULT 1 CHECK ("channel_email" IN (0,1)),
  "channel_inapp" INTEGER NOT NULL DEFAULT 1 CHECK ("channel_inapp" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "notification_preferences_interest_updates_check" CHECK ((interest_updates IN ('instant', 'daily', 'weekly', 'off'))),
  CONSTRAINT "notification_preferences_intro_requests_check" CHECK ((intro_requests IN ('instant', 'daily', 'weekly', 'off'))),
  CONSTRAINT "notification_preferences_new_rfps_check" CHECK ((new_rfps IN ('instant', 'daily', 'weekly', 'off'))),
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "notification_preferences_product_news_check" CHECK ((product_news IN ('instant', 'daily', 'weekly', 'off'))),
  CONSTRAINT "notification_preferences_referral_status_check" CHECK ((referral_status IN ('instant', 'daily', 'weekly', 'off'))),
  CONSTRAINT "notification_preferences_region_activation_check" CHECK ((region_activation IN ('instant', 'daily', 'weekly', 'off'))),
  CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE CASCADE
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" TEXT,
  "title" TEXT,
  "message" TEXT,
  "link_url" TEXT,
  "read_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE CASCADE
);

CREATE TABLE "org_karma" (
  "org_id" TEXT NOT NULL,
  "raw_points" INTEGER NOT NULL DEFAULT 0,
  "score" INTEGER NOT NULL DEFAULT 0,
  "level" INTEGER NOT NULL DEFAULT 1,
  "decay" TEXT NOT NULL DEFAULT 1,
  "last_earned_at" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "org_karma_level_check" CHECK (((level >= 1) AND (level <= 5))),
  CONSTRAINT "org_karma_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "org_karma_pkey" PRIMARY KEY (org_id)
);

CREATE TABLE "organization_categories" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  CONSTRAINT "organization_categories_category_id_fkey" FOREIGN KEY (category_id) REFERENCES trade_categories(id) ON DELETE CASCADE,
  CONSTRAINT "organization_categories_organization_id_category_id_key" UNIQUE (organization_id, category_id),
  CONSTRAINT "organization_categories_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "organization_categories_pkey" PRIMARY KEY (id)
);

CREATE TABLE "organization_members" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE (organization_id, user_id),
  CONSTRAINT "organization_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "organization_members_role_check" CHECK ((role IN ('owner', 'admin', 'member'))),
  CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE CASCADE
);

CREATE TABLE "organization_property_types" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "property_type_id" TEXT NOT NULL,
  CONSTRAINT "organization_property_types_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "organization_property_types_organization_id_property_type_i_key" UNIQUE (organization_id, property_type_id),
  CONSTRAINT "organization_property_types_pkey" PRIMARY KEY (id),
  CONSTRAINT "organization_property_types_property_type_id_fkey" FOREIGN KEY (property_type_id) REFERENCES property_types(id) ON DELETE CASCADE
);

CREATE TABLE "organization_regions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  CONSTRAINT "organization_regions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "organization_regions_organization_id_region_id_key" UNIQUE (organization_id, region_id),
  CONSTRAINT "organization_regions_pkey" PRIMARY KEY (id),
  CONSTRAINT "organization_regions_region_id_fkey" FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE
);

CREATE TABLE "organizations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "organization_type" TEXT NOT NULL DEFAULT 'trade_company',
  "website" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "logo_url" TEXT,
  "address_line_1" TEXT,
  "address_line_2" TEXT,
  "city" TEXT,
  "province" TEXT,
  "postal_code" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Canada',
  "short_description" TEXT,
  "full_description" TEXT,
  "years_in_business" INTEGER,
  "employee_count_range" TEXT,
  "insurance_status" TEXT,
  "wsib_status" TEXT,
  "emergency_service" INTEGER NOT NULL DEFAULT 0 CHECK ("emergency_service" IN (0,1)),
  "verified" INTEGER NOT NULL DEFAULT 0 CHECK ("verified" IN (0,1)),
  "featured" INTEGER NOT NULL DEFAULT 0 CHECK ("featured" IN (0,1)),
  "is_demo" INTEGER NOT NULL DEFAULT 0 CHECK ("is_demo" IN (0,1)),
  "profile_status" TEXT NOT NULL DEFAULT 'draft',
  "profile_completion_score" INTEGER NOT NULL DEFAULT 0,
  "public_contact_visibility" TEXT NOT NULL DEFAULT 'request_intro',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "google_place_id" TEXT,
  "google_rating" TEXT,
  "google_review_count" INTEGER,
  "google_ratings_synced_at" TEXT,
  "platinum" INTEGER NOT NULL DEFAULT 0 CHECK ("platinum" IN (0,1)),
  CONSTRAINT "organizations_organization_type_check" CHECK ((organization_type IN ('trade_company', 'property_manager', 'builder', 'owner', 'admin', 'supplier', 'landlord'))),
  CONSTRAINT "organizations_pkey" PRIMARY KEY (id),
  CONSTRAINT "organizations_profile_status_check" CHECK ((profile_status IN ('draft', 'pending_review', 'approved', 'rejected', 'suspended'))),
  CONSTRAINT "organizations_public_contact_visibility_check" CHECK ((public_contact_visibility IN ('show_contact', 'request_intro', 'hide_contact'))),
  CONSTRAINT "organizations_slug_key" UNIQUE (slug),
  CONSTRAINT "organizations_status_check" CHECK ((status IN ('active', 'suspended', 'deleted')))
);

CREATE TABLE "platform_settings" (
  "id" INTEGER NOT NULL DEFAULT 1 CHECK ("id" IN (0,1)),
  "site_name" TEXT NOT NULL DEFAULT 'PMRFP',
  "pricing_amount" TEXT NOT NULL DEFAULT 249,
  "stripe_price_id" TEXT,
  "default_disclaimer" TEXT,
  "admin_notification_email" TEXT DEFAULT 'admin@pmrfp.com',
  "support_email" TEXT DEFAULT 'support@pmrfp.com',
  "featured_categories" TEXT DEFAULT '[]' CHECK ("featured_categories" IS NULL OR json_valid("featured_categories")),
  "homepage_stats" TEXT DEFAULT '{}' CHECK ("homepage_stats" IS NULL OR json_valid("homepage_stats")),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "region_liquidity_threshold" INTEGER NOT NULL DEFAULT 3,
  CONSTRAINT "platform_settings_id_check" CHECK (id),
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY (id)
);

CREATE TABLE "profile_views" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "viewed_by_user_id" TEXT,
  "viewer_ip_hash" TEXT,
  "referrer" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "profile_views_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "profile_views_pkey" PRIMARY KEY (id),
  CONSTRAINT "profile_views_viewed_by_user_id_fkey" FOREIGN KEY (viewed_by_user_id) REFERENCES users_profile(id) ON DELETE SET NULL
);

CREATE TABLE "property_types" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1 CHECK ("active" IN (0,1)),
  CONSTRAINT "property_types_pkey" PRIMARY KEY (id),
  CONSTRAINT "property_types_slug_key" UNIQUE (slug)
);

CREATE TABLE "rate_limit_hits" (
  "key" TEXT NOT NULL,
  "window_start" TEXT NOT NULL,
  "hits" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY (key, window_start)
);

CREATE TABLE "region_requests" (
  "id" TEXT NOT NULL,
  "raw_name" TEXT NOT NULL,
  "normalized_slug" TEXT,
  "province" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Canada',
  "requested_by_user_id" TEXT,
  "suggested_region_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_region_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "region_requests_created_region_id_fkey" FOREIGN KEY (created_region_id) REFERENCES regions(id) ON DELETE SET NULL,
  CONSTRAINT "region_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "region_requests_requested_by_user_id_fkey" FOREIGN KEY (requested_by_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "region_requests_status_check" CHECK ((status IN ('pending', 'approved', 'merged', 'rejected'))),
  CONSTRAINT "region_requests_suggested_region_id_fkey" FOREIGN KEY (suggested_region_id) REFERENCES regions(id) ON DELETE SET NULL
);

CREATE TABLE "regional_waitlist" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "full_name" TEXT,
  "role" TEXT,
  "region_id" TEXT,
  "requested_region_text" TEXT,
  "province" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Canada',
  "category_slug" TEXT,
  "reason" TEXT NOT NULL DEFAULT 'early_access',
  "user_id" TEXT,
  "ghl_synced" INTEGER NOT NULL DEFAULT 0 CHECK ("ghl_synced" IN (0,1)),
  "notified_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "regional_waitlist_pkey" PRIMARY KEY (id),
  CONSTRAINT "regional_waitlist_reason_check" CHECK ((reason IN ('early_access', 'founding_region_rfp', 'no_supply_directory', 'region_request'))),
  CONSTRAINT "regional_waitlist_region_id_fkey" FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL,
  CONSTRAINT "regional_waitlist_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE SET NULL
);

CREATE TABLE "regions" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "province" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Canada',
  "parent_id" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1 CHECK ("active" IN (0,1)),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'auto',
  CONSTRAINT "regions_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES regions(id) ON DELETE SET NULL,
  CONSTRAINT "regions_pkey" PRIMARY KEY (id),
  CONSTRAINT "regions_slug_key" UNIQUE (slug),
  CONSTRAINT "regions_status_check" CHECK ((status IN ('auto', 'active', 'founding', 'hidden')))
);

CREATE TABLE "resources" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "excerpt" TEXT,
  "body" TEXT,
  "seo_title" TEXT,
  "meta_description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "is_demo" INTEGER NOT NULL DEFAULT 0 CHECK ("is_demo" IN (0,1)),
  "published_at" TEXT,
  "author_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "resources_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "resources_pkey" PRIMARY KEY (id),
  CONSTRAINT "resources_slug_key" UNIQUE (slug),
  CONSTRAINT "resources_status_check" CHECK ((status IN ('draft', 'published', 'archived')))
);

CREATE TABLE "review_invites" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "case_study_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_name" TEXT NOT NULL,
  "client_email" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "used_at" TEXT,
  CONSTRAINT "review_invites_case_study_id_fkey" FOREIGN KEY (case_study_id) REFERENCES case_studies(id) ON DELETE CASCADE,
  CONSTRAINT "review_invites_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "review_invites_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "review_invites_pkey" PRIMARY KEY (id),
  CONSTRAINT "review_invites_token_hash_key" UNIQUE (token_hash)
);

CREATE TABLE "rfp_bid_checks" (
  "rfp_id" TEXT NOT NULL,
  "result" TEXT CHECK ("result" IS NULL OR json_valid("result")),
  "model" TEXT,
  "error" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "rfp_bid_checks_pkey" PRIMARY KEY (rfp_id),
  CONSTRAINT "rfp_bid_checks_rfp_id_fkey" FOREIGN KEY (rfp_id) REFERENCES rfp_posts(id) ON DELETE CASCADE
);

CREATE TABLE "rfp_categories" (
  "id" TEXT NOT NULL,
  "rfp_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  CONSTRAINT "rfp_categories_category_id_fkey" FOREIGN KEY (category_id) REFERENCES trade_categories(id) ON DELETE CASCADE,
  CONSTRAINT "rfp_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "rfp_categories_rfp_id_category_id_key" UNIQUE (rfp_id, category_id),
  CONSTRAINT "rfp_categories_rfp_id_fkey" FOREIGN KEY (rfp_id) REFERENCES rfp_posts(id) ON DELETE CASCADE
);

CREATE TABLE "rfp_documents" (
  "id" TEXT NOT NULL,
  "rfp_id" TEXT NOT NULL,
  "file_url" TEXT,
  "file_path" TEXT,
  "file_name" TEXT,
  "file_type" TEXT,
  "file_size" INTEGER,
  "visibility" TEXT NOT NULL DEFAULT 'paid_users',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "rfp_documents_pkey" PRIMARY KEY (id),
  CONSTRAINT "rfp_documents_rfp_id_fkey" FOREIGN KEY (rfp_id) REFERENCES rfp_posts(id) ON DELETE CASCADE,
  CONSTRAINT "rfp_documents_visibility_check" CHECK ((visibility IN ('public', 'paid_users', 'admin_only')))
);

CREATE TABLE "rfp_interests" (
  "id" TEXT NOT NULL,
  "rfp_id" TEXT NOT NULL,
  "trade_organization_id" TEXT NOT NULL,
  "submitted_by_user_id" TEXT,
  "message" TEXT,
  "relevant_experience" TEXT,
  "availability" TEXT,
  "attachment_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "contact_revealed" INTEGER NOT NULL DEFAULT 0 CHECK ("contact_revealed" IN (0,1)),
  "admin_notes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "case_study_ids" TEXT NOT NULL DEFAULT '[]' CHECK ("case_study_ids" IS NULL OR json_valid("case_study_ids")) CHECK (json_type("case_study_ids")='array'),
  CONSTRAINT "rfp_interests_case_study_ids_check" CHECK ((json_array_length(case_study_ids) <= 3)),
  CONSTRAINT "rfp_interests_pkey" PRIMARY KEY (id),
  CONSTRAINT "rfp_interests_rfp_id_fkey" FOREIGN KEY (rfp_id) REFERENCES rfp_posts(id) ON DELETE CASCADE,
  CONSTRAINT "rfp_interests_rfp_id_trade_organization_id_key" UNIQUE (rfp_id, trade_organization_id),
  CONSTRAINT "rfp_interests_status_check" CHECK ((status IN ('submitted', 'viewed', 'contact_revealed', 'shortlisted', 'declined', 'closed'))),
  CONSTRAINT "rfp_interests_submitted_by_user_id_fkey" FOREIGN KEY (submitted_by_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "rfp_interests_trade_organization_id_fkey" FOREIGN KEY (trade_organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE "rfp_posts" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "summary" TEXT,
  "scope" TEXT,
  "requirements" TEXT,
  "property_type_id" TEXT,
  "city" TEXT,
  "province" TEXT,
  "region_id" TEXT,
  "exact_address" TEXT,
  "show_exact_address" INTEGER NOT NULL DEFAULT 0 CHECK ("show_exact_address" IN (0,1)),
  "budget_min" TEXT,
  "budget_max" TEXT,
  "budget_public" INTEGER NOT NULL DEFAULT 0 CHECK ("budget_public" IN (0,1)),
  "desired_start_date" TEXT,
  "deadline" TEXT,
  "site_visit_date" TEXT,
  "submission_instructions" TEXT,
  "contact_name" TEXT,
  "contact_email" TEXT,
  "contact_phone" TEXT,
  "contact_visibility" TEXT NOT NULL DEFAULT 'pmrfp_mediated',
  "posted_by_user_id" TEXT,
  "posted_by_organization_id" TEXT,
  "source_type" TEXT NOT NULL DEFAULT 'property_manager_direct',
  "source_url" TEXT,
  "source_notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "is_demo" INTEGER NOT NULL DEFAULT 0 CHECK ("is_demo" IN (0,1)),
  "published_at" TEXT,
  "closed_at" TEXT,
  "internal_notes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "expiry_notice_sent_at" TEXT,
  "keep_alive_token" TEXT NOT NULL,
  "awarded_rfp_id" TEXT,
  "gc_project_name" TEXT,
  CONSTRAINT "rfp_posts_awarded_rfp_id_fkey" FOREIGN KEY (awarded_rfp_id) REFERENCES rfp_posts(id) ON DELETE SET NULL,
  CONSTRAINT "rfp_posts_contact_visibility_check" CHECK ((contact_visibility IN ('public_contact', 'pmrfp_mediated', 'anonymous_until_interest_approved'))),
  CONSTRAINT "rfp_posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "rfp_posts_posted_by_organization_id_fkey" FOREIGN KEY (posted_by_organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT "rfp_posts_posted_by_user_id_fkey" FOREIGN KEY (posted_by_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "rfp_posts_property_type_id_fkey" FOREIGN KEY (property_type_id) REFERENCES property_types(id) ON DELETE SET NULL,
  CONSTRAINT "rfp_posts_region_id_fkey" FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL,
  CONSTRAINT "rfp_posts_slug_key" UNIQUE (slug),
  CONSTRAINT "rfp_posts_source_type_check" CHECK ((source_type IN ('property_manager_direct', 'admin_seeded', 'public_source', 'partner_referral', 'gc_package'))),
  CONSTRAINT "rfp_posts_status_check" CHECK ((status IN ('draft', 'pending_review', 'published', 'closed', 'awarded', 'expired', 'archived', 'rejected')))
);

CREATE TABLE "rfp_views" (
  "id" TEXT NOT NULL,
  "rfp_id" TEXT NOT NULL,
  "viewed_by_user_id" TEXT,
  "organization_id" TEXT,
  "viewer_ip_hash" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "rfp_views_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT "rfp_views_pkey" PRIMARY KEY (id),
  CONSTRAINT "rfp_views_rfp_id_fkey" FOREIGN KEY (rfp_id) REFERENCES rfp_posts(id) ON DELETE CASCADE,
  CONSTRAINT "rfp_views_viewed_by_user_id_fkey" FOREIGN KEY (viewed_by_user_id) REFERENCES users_profile(id) ON DELETE SET NULL
);

CREATE TABLE "saved_rfps" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT,
  "rfp_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "saved_rfps_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "saved_rfps_pkey" PRIMARY KEY (id),
  CONSTRAINT "saved_rfps_rfp_id_fkey" FOREIGN KEY (rfp_id) REFERENCES rfp_posts(id) ON DELETE CASCADE,
  CONSTRAINT "saved_rfps_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE CASCADE,
  CONSTRAINT "saved_rfps_user_id_rfp_id_key" UNIQUE (user_id, rfp_id)
);

CREATE TABLE "sponsor_clicks" (
  "day" TEXT NOT NULL,
  "sponsor" TEXT NOT NULL,
  "placement" TEXT NOT NULL,
  "trade" TEXT NOT NULL DEFAULT '',
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "region" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "sponsor_clicks_pkey" PRIMARY KEY (day, sponsor, placement, trade, region),
  CONSTRAINT "sponsor_clicks_placement_check" CHECK ((length(placement) <= 40)),
  CONSTRAINT "sponsor_clicks_region_check" CHECK ((length(region) <= 60)),
  CONSTRAINT "sponsor_clicks_sponsor_check" CHECK ((length(sponsor) <= 40)),
  CONSTRAINT "sponsor_clicks_trade_check" CHECK ((length(trade) <= 60))
);

CREATE TABLE "sponsor_impressions" (
  "day" TEXT NOT NULL,
  "sponsor" TEXT NOT NULL,
  "placement" TEXT NOT NULL,
  "trade" TEXT NOT NULL DEFAULT '',
  "region" TEXT NOT NULL DEFAULT '',
  "impressions" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "sponsor_impressions_impressions_check" CHECK ((impressions >= 0)),
  CONSTRAINT "sponsor_impressions_pkey" PRIMARY KEY (day, sponsor, placement, trade, region),
  CONSTRAINT "sponsor_impressions_placement_check" CHECK ((length(placement) <= 40)),
  CONSTRAINT "sponsor_impressions_region_check" CHECK ((length(region) <= 60)),
  CONSTRAINT "sponsor_impressions_sponsor_check" CHECK ((length(sponsor) <= 40)),
  CONSTRAINT "sponsor_impressions_trade_check" CHECK ((length(trade) <= 60))
);

CREATE TABLE "sponsors" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "logo_url" TEXT,
  "url" TEXT NOT NULL,
  "headline" TEXT NOT NULL DEFAULT '',
  "message" TEXT NOT NULL DEFAULT '',
  "cta" TEXT NOT NULL DEFAULT '',
  "headline_fr" TEXT,
  "message_fr" TEXT,
  "cta_fr" TEXT,
  "tier" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "trades" TEXT NOT NULL CHECK ("trades" IS NULL OR json_valid("trades")) CHECK (json_type("trades")='array'),
  "regions" TEXT NOT NULL DEFAULT '[]' CHECK ("regions" IS NULL OR json_valid("regions")) CHECK (json_type("regions")='array'),
  "start_date" TEXT,
  "end_date" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "monthly_price" TEXT,
  "currency" TEXT,
  "contact_name" TEXT,
  "contact_email" TEXT,
  "notes" TEXT,
  "stripe_customer_id" TEXT,
  "stripe_subscription_id" TEXT,
  "stripe_checkout_session_id" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "sponsors_approved_copy" CHECK (((status <> 'approved') OR ((length(headline) > 0) AND (length(message) > 0) AND (length(cta) > 0) AND (start_date IS NOT NULL)))),
  CONSTRAINT "sponsors_contact_email_check" CHECK (((contact_email IS NULL) OR (length(contact_email) <= 200))),
  CONSTRAINT "sponsors_contact_name_check" CHECK (((contact_name IS NULL) OR (length(contact_name) <= 120))),
  CONSTRAINT "sponsors_country_check" CHECK ((country IN ('CA', 'US'))),
  CONSTRAINT "sponsors_cta_check" CHECK ((length(cta) <= 28)),
  CONSTRAINT "sponsors_cta_fr_check" CHECK (((cta_fr IS NULL) OR (length(cta_fr) <= 28))),
  CONSTRAINT "sponsors_currency_check" CHECK (((currency IS NULL) OR (currency IN ('CAD', 'USD')))),
  CONSTRAINT "sponsors_dates" CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))),
  CONSTRAINT "sponsors_headline_check" CHECK ((length(headline) <= 70)),
  CONSTRAINT "sponsors_headline_fr_check" CHECK (((headline_fr IS NULL) OR (length(headline_fr) <= 70))),
  CONSTRAINT "sponsors_message_check" CHECK ((length(message) <= 180)),
  CONSTRAINT "sponsors_message_fr_check" CHECK (((message_fr IS NULL) OR (length(message_fr) <= 180))),
  CONSTRAINT "sponsors_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 120))),
  CONSTRAINT "sponsors_notes_check" CHECK (((notes IS NULL) OR (length(notes) <= 4000))),
  CONSTRAINT "sponsors_pkey" PRIMARY KEY (id),
  CONSTRAINT "sponsors_regions_by_tier" CHECK (((tier = 'national') = (json_array_length(regions) = 0))),
  CONSTRAINT "sponsors_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "sponsors_slug_key" UNIQUE (slug),
  CONSTRAINT "sponsors_status_check" CHECK ((status IN ('draft', 'pending', 'approved', 'paused', 'ended', 'rejected'))),
  CONSTRAINT "sponsors_stripe_checkout_session_id_key" UNIQUE (stripe_checkout_session_id),
  CONSTRAINT "sponsors_stripe_subscription_id_key" UNIQUE (stripe_subscription_id),
  CONSTRAINT "sponsors_tier_check" CHECK ((tier IN ('province', 'national', 'digest'))),
  CONSTRAINT "sponsors_trades_check" CHECK (((json_array_length(trades) >= 1) AND (json_array_length(trades) <= 10)))
);

CREATE TABLE "stripe_webhook_events" (
  "id" TEXT NOT NULL,
  "processed_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY (id)
);

CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT,
  "stripe_customer_id" TEXT,
  "stripe_subscription_id" TEXT,
  "stripe_price_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'inactive',
  "current_period_start" TEXT,
  "current_period_end" TEXT,
  "cancel_at_period_end" INTEGER NOT NULL DEFAULT 0 CHECK ("cancel_at_period_end" IN (0,1)),
  "amount" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'CAD',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "tier" TEXT NOT NULL DEFAULT 'pro',
  CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "subscriptions_organization_id_key" UNIQUE (organization_id),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "subscriptions_status_check" CHECK ((status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'comped', 'inactive'))),
  CONSTRAINT "subscriptions_tier_check" CHECK ((tier IN ('seo', 'pro', 'featured', 'realtor'))),
  CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE SET NULL
);

CREATE TABLE "talent_contacts" (
  "id" TEXT NOT NULL,
  "talent_user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "sender_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "talent_contacts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "talent_contacts_pkey" PRIMARY KEY (id),
  CONSTRAINT "talent_contacts_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "talent_contacts_talent_user_id_fkey" FOREIGN KEY (talent_user_id) REFERENCES talent_profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE "talent_endorsements" (
  "id" TEXT NOT NULL,
  "talent_user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "endorsed_by" TEXT,
  "note" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "talent_endorsements_endorsed_by_fkey" FOREIGN KEY (endorsed_by) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "talent_endorsements_note_check" CHECK (((length(note) >= 10) AND (length(note) <= 600))),
  CONSTRAINT "talent_endorsements_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "talent_endorsements_pkey" PRIMARY KEY (id),
  CONSTRAINT "talent_endorsements_talent_user_id_fkey" FOREIGN KEY (talent_user_id) REFERENCES talent_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT "talent_endorsements_talent_user_id_organization_id_key" UNIQUE (talent_user_id, organization_id)
);

CREATE TABLE "talent_private" (
  "user_id" TEXT NOT NULL,
  "phone" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "talent_private_phone_check" CHECK ((length(phone) <= 30)),
  CONSTRAINT "talent_private_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "talent_private_user_id_fkey" FOREIGN KEY (user_id) REFERENCES talent_profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE "talent_profiles" (
  "user_id" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "headline" TEXT,
  "primary_trade_id" TEXT,
  "other_trade_ids" TEXT NOT NULL DEFAULT '[]' CHECK ("other_trade_ids" IS NULL OR json_valid("other_trade_ids")) CHECK (json_type("other_trade_ids")='array'),
  "region_id" TEXT,
  "city" TEXT,
  "years_experience" INTEGER,
  "certifications" TEXT NOT NULL DEFAULT '[]' CHECK ("certifications" IS NULL OR json_valid("certifications")) CHECK (json_type("certifications")='array'),
  "availability" TEXT NOT NULL DEFAULT 'open_to_offers',
  "employment_types" TEXT NOT NULL DEFAULT '[]' CHECK ("employment_types" IS NULL OR json_valid("employment_types")) CHECK (json_type("employment_types")='array'),
  "pay_expectation" TEXT,
  "bio" TEXT,
  "published" INTEGER NOT NULL DEFAULT 1 CHECK ("published" IN (0,1)),
  "contact_visible" INTEGER NOT NULL DEFAULT 0 CHECK ("contact_visible" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "talent_profiles_availability_check" CHECK ((availability IN ('available_now', 'open_to_offers', 'not_looking'))),
  CONSTRAINT "talent_profiles_bio_check" CHECK ((length(bio) <= 3000)),
  CONSTRAINT "talent_profiles_certifications_check" CHECK ((json_array_length(certifications) <= 30)),
  CONSTRAINT "talent_profiles_city_check" CHECK ((length(city) <= 80)),
  CONSTRAINT "talent_profiles_display_name_check" CHECK (((length(display_name) >= 2) AND (length(display_name) <= 80))),
  CONSTRAINT "talent_profiles_handle_key" UNIQUE (handle),
  CONSTRAINT "talent_profiles_headline_check" CHECK ((length(headline) <= 140)),
  CONSTRAINT "talent_profiles_pay_expectation_check" CHECK ((length(pay_expectation) <= 80)),
  CONSTRAINT "talent_profiles_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "talent_profiles_primary_trade_id_fkey" FOREIGN KEY (primary_trade_id) REFERENCES trade_categories(id) ON DELETE SET NULL,
  CONSTRAINT "talent_profiles_region_id_fkey" FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL,
  CONSTRAINT "talent_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "_auth_users"(id) ON DELETE CASCADE,
  CONSTRAINT "talent_profiles_years_experience_check" CHECK (((years_experience >= 0) AND (years_experience <= 60)))
);

CREATE TABLE "trade_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "parent_id" TEXT,
  "description" TEXT,
  "icon" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1 CHECK ("active" IN (0,1)),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "trade_categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES trade_categories(id) ON DELETE SET NULL,
  CONSTRAINT "trade_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "trade_categories_slug_key" UNIQUE (slug)
);

CREATE TABLE "trusted_list_items" (
  "owner_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "trusted_list_items_note_check" CHECK ((length(note) <= 280)),
  CONSTRAINT "trusted_list_items_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "trusted_list_items_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES trusted_lists(owner_id) ON DELETE CASCADE,
  CONSTRAINT "trusted_list_items_pkey" PRIMARY KEY (owner_id, organization_id)
);

CREATE TABLE "trusted_lists" (
  "owner_id" TEXT NOT NULL,
  "organization_id" TEXT,
  "handle" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "brokerage" TEXT,
  "headline" TEXT,
  "contact_phone" TEXT,
  "contact_email" TEXT,
  "published" INTEGER NOT NULL DEFAULT 1 CHECK ("published" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "trusted_lists_brokerage_check" CHECK ((length(brokerage) <= 80)),
  CONSTRAINT "trusted_lists_contact_email_check" CHECK ((length(contact_email) <= 120)),
  CONSTRAINT "trusted_lists_contact_phone_check" CHECK ((length(contact_phone) <= 30)),
  CONSTRAINT "trusted_lists_display_name_check" CHECK (((length(display_name) >= 2) AND (length(display_name) <= 80))),
  CONSTRAINT "trusted_lists_handle_key" UNIQUE (handle),
  CONSTRAINT "trusted_lists_headline_check" CHECK ((length(headline) <= 160)),
  CONSTRAINT "trusted_lists_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT "trusted_lists_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES users_profile(id) ON DELETE CASCADE,
  CONSTRAINT "trusted_lists_pkey" PRIMARY KEY (owner_id)
);

CREATE TABLE "users_profile" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "full_name" TEXT,
  "phone" TEXT,
  "avatar_url" TEXT,
  "primary_role" TEXT NOT NULL DEFAULT 'trade',
  "onboarding_completed" INTEGER NOT NULL DEFAULT 0 CHECK ("onboarding_completed" IN (0,1)),
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "users_profile_id_fkey" FOREIGN KEY (id) REFERENCES "_auth_users"(id) ON DELETE CASCADE,
  CONSTRAINT "users_profile_pkey" PRIMARY KEY (id),
  CONSTRAINT "users_profile_primary_role_check" CHECK ((primary_role IN ('trade', 'property_manager', 'admin', 'super_admin', 'visitor', 'supplier', 'real_estate_agent', 'talent'))),
  CONSTRAINT "users_profile_status_check" CHECK ((status IN ('active', 'suspended', 'deleted')))
);

CREATE TABLE "vendor_reviews" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "reviewer_user_id" TEXT,
  "reviewer_name" TEXT NOT NULL,
  "reviewer_company" TEXT,
  "rating" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "project_context" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "case_study_id" TEXT,
  "reviewer_email" TEXT,
  "verified_via" TEXT,
  "show_building" INTEGER NOT NULL DEFAULT 0 CHECK ("show_building" IN (0,1)),
  "reference_ok" INTEGER NOT NULL DEFAULT 0 CHECK ("reference_ok" IN (0,1)),
  "reply" TEXT,
  "reply_at" TEXT,
  CONSTRAINT "vendor_reviews_case_study_id_fkey" FOREIGN KEY (case_study_id) REFERENCES case_studies(id) ON DELETE SET NULL,
  CONSTRAINT "vendor_reviews_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "vendor_reviews_pkey" PRIMARY KEY (id),
  CONSTRAINT "vendor_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
  CONSTRAINT "vendor_reviews_reviewer_user_id_fkey" FOREIGN KEY (reviewer_user_id) REFERENCES users_profile(id) ON DELETE SET NULL,
  CONSTRAINT "vendor_reviews_status_check" CHECK ((status IN ('pending_review', 'published', 'rejected'))),
  CONSTRAINT "vendor_reviews_verified_via_check" CHECK ((verified_via IN ('project_invite', 'awarded_rfp', 'admin')))
);

CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

CREATE INDEX case_studies_cat_region_idx ON case_studies (category_id, region_id);

CREATE INDEX case_studies_org_idx ON case_studies (organization_id);

CREATE INDEX case_studies_public_idx ON case_studies (published_at DESC) WHERE ((status = 'published') AND (visibility = 'public'));

CREATE INDEX case_studies_status_idx ON case_studies (status);

CREATE INDEX case_study_share_links_cs_idx ON case_study_share_links (case_study_id);

CREATE INDEX case_study_share_links_org_idx ON case_study_share_links (organization_id, created_at DESC);

CREATE INDEX contact_requests_status_idx ON contact_requests (status);

CREATE INDEX contact_requests_target_idx ON contact_requests (target_organization_id);

CREATE INDEX device_push_tokens_user_idx ON device_push_tokens (user_id);

CREATE INDEX forum_posts_author_idx ON forum_posts (author_id, created_at DESC);

CREATE INDEX forum_posts_thread_idx ON forum_posts (thread_id, status, created_at);

CREATE INDEX forum_profiles_org_idx ON forum_profiles (organization_id);

CREATE INDEX forum_reports_open_idx ON forum_reports (status, created_at DESC);

CREATE INDEX forum_threads_author_idx ON forum_threads (author_id, created_at DESC);

CREATE INDEX forum_threads_auto_list_idx ON forum_threads (category_id, status, last_post_at DESC) WHERE (auto_source_key IS NULL);

CREATE UNIQUE INDEX forum_threads_auto_source_key_idx ON forum_threads (auto_source_key) WHERE (auto_source_key IS NOT NULL);

CREATE INDEX forum_threads_list_idx ON forum_threads (category_id, status, is_pinned DESC, last_post_at DESC);

CREATE INDEX job_applications_job_idx ON job_applications (job_id, created_at DESC);

CREATE INDEX job_posts_open_idx ON job_posts (status, expires_at);

CREATE INDEX job_posts_org_idx ON job_posts (organization_id);

CREATE INDEX karma_events_kind_idx ON karma_events (kind);

CREATE INDEX karma_events_org_idx ON karma_events (org_id, created_at DESC);

CREATE INDEX major_projects_changed_idx ON major_projects (status_changed_at);

CREATE INDEX major_projects_link_group_idx ON major_projects (link_group) WHERE (link_group IS NOT NULL);

CREATE INDEX major_projects_province_idx ON major_projects (province) WHERE (NOT stale);

CREATE INDEX major_projects_review_idx ON major_projects (review_status) WHERE (source = 'manual');

CREATE INDEX major_projects_source_idx ON major_projects (source);

CREATE INDEX marketplace_listings_browse_idx ON marketplace_listings (status, expires_at, featured_until DESC, created_at DESC);

CREATE INDEX marketplace_listings_category_idx ON marketplace_listings (category, region_slug);

CREATE INDEX marketplace_listings_user_idx ON marketplace_listings (user_id, status);

CREATE INDEX marketplace_messages_listing_idx ON marketplace_messages (listing_id, created_at DESC);

CREATE INDEX notifications_user_idx ON notifications (user_id);

CREATE INDEX org_karma_level_idx ON org_karma (level);

CREATE INDEX org_categories_cat_idx ON organization_categories (category_id);

CREATE INDEX org_categories_org_idx ON organization_categories (organization_id);

CREATE INDEX org_members_org_idx ON organization_members (organization_id);

CREATE INDEX org_members_user_idx ON organization_members (user_id);

CREATE INDEX org_proptypes_org_idx ON organization_property_types (organization_id);

CREATE INDEX org_regions_org_idx ON organization_regions (organization_id);

CREATE INDEX org_regions_region_idx ON organization_regions (region_id);

CREATE INDEX organizations_featured_idx ON organizations (featured);

CREATE INDEX organizations_platinum_idx ON organizations (platinum) WHERE platinum;

CREATE INDEX organizations_profile_status_idx ON organizations (profile_status);

CREATE INDEX organizations_status_idx ON organizations (status);

CREATE INDEX organizations_type_idx ON organizations (organization_type);

CREATE INDEX organizations_verified_idx ON organizations (verified);

CREATE INDEX profile_views_org_idx ON profile_views (organization_id);

CREATE INDEX region_requests_status_idx ON region_requests (status);

CREATE INDEX regional_waitlist_country_idx ON regional_waitlist (country);

CREATE INDEX regional_waitlist_reason_idx ON regional_waitlist (reason);

CREATE INDEX regional_waitlist_region_idx ON regional_waitlist (region_id);

CREATE INDEX regions_active_idx ON regions (active);

CREATE INDEX resources_status_idx ON resources (status);

CREATE INDEX review_invites_case_study_idx ON review_invites (case_study_id);

CREATE INDEX review_invites_org_idx ON review_invites (organization_id, created_at DESC);

CREATE INDEX rfp_categories_cat_idx ON rfp_categories (category_id);

CREATE INDEX rfp_categories_rfp_idx ON rfp_categories (rfp_id);

CREATE INDEX rfp_documents_rfp_idx ON rfp_documents (rfp_id);

CREATE INDEX rfp_interests_org_idx ON rfp_interests (trade_organization_id);

CREATE INDEX rfp_interests_rfp_idx ON rfp_interests (rfp_id);

CREATE INDEX rfp_posts_awarded_rfp_idx ON rfp_posts (awarded_rfp_id) WHERE (awarded_rfp_id IS NOT NULL);

CREATE INDEX rfp_posts_deadline_idx ON rfp_posts (deadline);

CREATE INDEX rfp_posts_expiry_sweep_idx ON rfp_posts (status, deadline);

CREATE UNIQUE INDEX rfp_posts_keep_alive_token_idx ON rfp_posts (keep_alive_token);

CREATE INDEX rfp_posts_posted_org_idx ON rfp_posts (posted_by_organization_id);

CREATE INDEX rfp_posts_posted_user_idx ON rfp_posts (posted_by_user_id);

CREATE INDEX rfp_posts_proptype_idx ON rfp_posts (property_type_id);

CREATE INDEX rfp_posts_region_idx ON rfp_posts (region_id);

CREATE INDEX rfp_posts_status_idx ON rfp_posts (status);

CREATE INDEX rfp_views_rfp_idx ON rfp_views (rfp_id);

CREATE INDEX saved_rfps_rfp_idx ON saved_rfps (rfp_id);

CREATE INDEX saved_rfps_user_idx ON saved_rfps (user_id);

CREATE INDEX sponsors_country_idx ON sponsors (country);

CREATE INDEX sponsors_status_idx ON sponsors (status);

CREATE INDEX subscriptions_org_idx ON subscriptions (organization_id);

CREATE INDEX subscriptions_status_idx ON subscriptions (status);

CREATE INDEX subscriptions_stripe_sub_idx ON subscriptions (stripe_subscription_id);

CREATE INDEX talent_contacts_org_idx ON talent_contacts (organization_id, created_at DESC);

CREATE INDEX talent_endorsements_talent_idx ON talent_endorsements (talent_user_id, created_at DESC);

CREATE INDEX talent_profiles_browse_idx ON talent_profiles (published, availability);

CREATE INDEX talent_profiles_trade_idx ON talent_profiles (primary_trade_id);

CREATE INDEX trade_categories_active_idx ON trade_categories (active);

CREATE INDEX trusted_list_items_org_idx ON trusted_list_items (organization_id);

CREATE INDEX users_profile_role_idx ON users_profile (primary_role);

CREATE INDEX users_profile_status_idx ON users_profile (status);

CREATE INDEX vendor_reviews_case_study_idx ON vendor_reviews (case_study_id) WHERE (case_study_id IS NOT NULL);

CREATE INDEX vendor_reviews_org_idx ON vendor_reviews (organization_id, status);
