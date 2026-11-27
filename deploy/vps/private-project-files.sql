CREATE TABLE IF NOT EXISTS _private_project_files (
  source_path TEXT PRIMARY KEY NOT NULL CHECK (length(source_path)=77),
  sha256 TEXT NOT NULL CHECK (length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  etag TEXT NOT NULL CHECK (length(etag)=32 AND etag NOT GLOB '*[^0-9a-f]*'),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 10485760)
);
