CREATE TABLE IF NOT EXISTS _company_media (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id)=36),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  kind TEXT NOT NULL CHECK (kind IN ('logo','portfolio')),
  sha256 TEXT NOT NULL CHECK (length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 12 AND 5242880),
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS _company_media_org_idx ON _company_media(organization_id,kind,created_at);
CREATE TABLE IF NOT EXISTS _company_legacy_portfolio (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id)=36),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  asset_id TEXT NOT NULL UNIQUE CHECK (length(asset_id)=64 AND asset_id NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS _company_legacy_portfolio_org_idx ON _company_legacy_portfolio(organization_id,created_at);
