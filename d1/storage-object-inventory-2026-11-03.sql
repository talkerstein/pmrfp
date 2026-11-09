-- Read-only object manifest. Results contain private paths/ownership metadata;
-- save only to protected ignored artifacts, never source control or chat output.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT jsonb_build_object(
 'captured_at',transaction_timestamp(),
 'buckets',(SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.id),'[]'::jsonb) FROM storage.buckets b),
 'objects',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',o.id,'bucket_id',o.bucket_id,'name',o.name,'metadata',o.metadata,
   'owner',to_jsonb(o)->'owner','owner_id',to_jsonb(o)->'owner_id',
   'created_at',o.created_at,'updated_at',o.updated_at
 ) ORDER BY o.bucket_id,o.name),'[]'::jsonb) FROM storage.objects o)
) AS private_storage_manifest;
COMMIT;
