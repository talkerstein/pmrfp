-- Enable the marker only on the application database that accepts native profile writes.
CREATE TABLE IF NOT EXISTS _customer_app_authority (
  id INTEGER PRIMARY KEY CHECK (id=1),
  mode TEXT NOT NULL CHECK (mode='native-v1')
);

CREATE TABLE IF NOT EXISTS _customer_role_picks (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('trade','property_manager','supplier')),
  org_kind TEXT CHECK(org_kind IN ('builder','landlord')),
  award TEXT
);
