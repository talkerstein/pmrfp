-- Run ONLY against pmrfp-api-sandbox-20261022, after the repository candidate schema.
-- These IDs do not create accounts in Supabase Auth. Real users are not impersonated.
CREATE TABLE IF NOT EXISTS _d1_sandbox(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT INTO _d1_sandbox(key,value) VALUES('dataset','synthetic-only') ON CONFLICT(key) DO NOTHING;
INSERT INTO _auth_users(id) VALUES('10000000-0000-0000-0000-000000000001') ON CONFLICT(id) DO NOTHING;
INSERT INTO users_profile(id,email,primary_role)
VALUES('10000000-0000-0000-0000-000000000001','synthetic-trade@example.invalid','trade') ON CONFLICT(id) DO NOTHING;
INSERT INTO rfp_posts(id,title,slug,status,keep_alive_token)
VALUES('20000000-0000-0000-0000-000000000001','Synthetic roof project','synthetic-roof','published','synthetic-not-a-live-token') ON CONFLICT(id) DO NOTHING;
