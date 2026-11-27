CREATE TABLE IF NOT EXISTS _legacy_opportunity_unsubscribe (
  user_id TEXT NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  token_sha256 TEXT NOT NULL CHECK (length(token_sha256)=64 AND token_sha256 NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (user_id,token_sha256)
);
