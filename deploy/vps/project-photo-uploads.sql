CREATE TABLE IF NOT EXISTS _project_photo_uploads (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id)=36),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL CHECK (length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 10485760),
  expires_at INTEGER NOT NULL
);
