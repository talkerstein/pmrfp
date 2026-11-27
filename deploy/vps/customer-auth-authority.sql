-- Install only on the separate cutover candidate. The mirror requires its original schema.
CREATE TABLE IF NOT EXISTS _auth_native_authority (
  id INTEGER PRIMARY KEY CHECK (id=1),
  mode TEXT NOT NULL CHECK (mode='native-v1')
);

-- Native auth checks for the absence of a mirror marker row. A candidate
-- imported directly from a sealed backup still needs the empty marker table.
CREATE TABLE IF NOT EXISTS _auth_customer_staging (
  id INTEGER PRIMARY KEY CHECK(id=1),
  mode TEXT NOT NULL CHECK(mode='customer-staging-v1'),
  source_sha256 TEXT NOT NULL,
  records INTEGER NOT NULL,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS _auth_password_resets (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS _auth_pending_signup (
  mailbox TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  lang TEXT NOT NULL,
  preferences TEXT NOT NULL CHECK (json_valid(preferences)),
  signed_up_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0,1))
);

CREATE TABLE IF NOT EXISTS _auth_source_metadata (
  user_id TEXT PRIMARY KEY REFERENCES user(id),
  metadata TEXT NOT NULL
);
