-- Synthetic write rehearsal only. An outbox row records the notification work
-- to be performed after a successful interest write.
CREATE TABLE _d1_interest_outbox (
  interest_id TEXT PRIMARY KEY REFERENCES rfp_interests(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
