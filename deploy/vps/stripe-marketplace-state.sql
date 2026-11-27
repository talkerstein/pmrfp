-- Record each purchased extension once, even if Stripe delivers another event for the session.
CREATE TABLE IF NOT EXISTS _billing_marketplace_checkouts (
  checkout_id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  user_id TEXT NOT NULL
);

-- A checkout can be represented by multiple event IDs after delayed payment.
CREATE TABLE IF NOT EXISTS _billing_spotlight_checkouts (
  checkout_id TEXT PRIMARY KEY
);
