CREATE TABLE IF NOT EXISTS _private_attachments (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id)=36),
  kind TEXT NOT NULL CHECK (kind IN ('contract','certificate','quote')),
  record_id TEXT NOT NULL CHECK (length(record_id)=36),
  organization_id TEXT NOT NULL CHECK (length(organization_id)=36),
  mime TEXT NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 10485760),
  sha256 TEXT NOT NULL CHECK (length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL
);
