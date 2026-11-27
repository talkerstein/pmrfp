CREATE TABLE IF NOT EXISTS _marketplace_media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 4 AND 10485760),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 1920),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 1920),
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS _marketplace_media_owner ON _marketplace_media(user_id);
