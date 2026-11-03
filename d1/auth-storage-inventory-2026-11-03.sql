-- Aggregate-only inventory for the complete Supabase exit.
-- Does not return emails, phone numbers, password hashes, tokens or object paths.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT jsonb_build_object(
 'users', (SELECT jsonb_build_object(
   'total',count(*),
   'with_password',count(*) FILTER (WHERE COALESCE(to_jsonb(u)->>'encrypted_password','')<>''),
   'bcrypt_passwords',count(*) FILTER (WHERE COALESCE(to_jsonb(u)->>'encrypted_password','') ~ '^\$2[aby]\$'),
   'email_confirmed',count(*) FILTER (WHERE to_jsonb(u)->>'email_confirmed_at' IS NOT NULL),
   'phone_confirmed',count(*) FILTER (WHERE to_jsonb(u)->>'phone_confirmed_at' IS NOT NULL),
   'anonymous',count(*) FILTER (WHERE to_jsonb(u)->>'is_anonymous'='true'),
   'sso',count(*) FILTER (WHERE to_jsonb(u)->>'is_sso_user'='true'),
   'soft_deleted',count(*) FILTER (WHERE to_jsonb(u)->>'deleted_at' IS NOT NULL),
   'currently_banned',count(*) FILTER (WHERE (to_jsonb(u)->>'banned_until')::timestamptz>now())
 ) FROM auth.users u),
 'identity_providers',(SELECT COALESCE(jsonb_agg(x ORDER BY provider),'[]'::jsonb) FROM (SELECT provider,count(*) AS identities FROM auth.identities GROUP BY provider) x),
 'auth_features',jsonb_build_object(
   'mfa_factors',(SELECT count(*) FROM auth.mfa_factors),
   'verified_mfa_factors',(SELECT count(*) FROM auth.mfa_factors WHERE status='verified'),
   'passkeys',(SELECT count(*) FROM auth.webauthn_credentials),
   'saml_providers',(SELECT count(*) FROM auth.saml_providers),
   'oauth_clients',(SELECT count(*) FROM auth.oauth_clients),
   'oauth_consents',(SELECT count(*) FROM auth.oauth_consents)
 ),
 'auth_relations',(SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='auth'),
 'storage_buckets',(SELECT COALESCE(jsonb_agg(x ORDER BY id),'[]'::jsonb) FROM (SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets) x),
 'storage_objects',(SELECT COALESCE(jsonb_agg(x ORDER BY bucket_id),'[]'::jsonb) FROM (
   SELECT bucket_id,count(*) AS objects,
   sum(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::numeric ELSE 0 END) AS recorded_bytes
   FROM storage.objects GROUP BY bucket_id
 ) x)
) AS migration_inventory;
COMMIT;
