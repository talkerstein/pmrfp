-- Track event order without enabling billing writes or changing subscriptions.
CREATE TABLE IF NOT EXISTS _billing_authority (
  id INTEGER PRIMARY KEY CHECK (id=1),
  mode TEXT NOT NULL CHECK (mode='d1-authoritative-v1')
);

CREATE TABLE IF NOT EXISTS _billing_subscription_state (
  subscription_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_created INTEGER NOT NULL CHECK (event_created > 0)
);
