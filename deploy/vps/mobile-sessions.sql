CREATE TABLE IF NOT EXISTS _mobile_access (
  digest TEXT PRIMARY KEY NOT NULL CHECK (length(digest)=64),
  kind TEXT NOT NULL CHECK (kind IN ('code','session')),
  proof TEXT CHECK (proof IS NULL OR length(proof)=64),
  encrypted_session TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS _mobile_access_expiry ON _mobile_access(expires_at);
