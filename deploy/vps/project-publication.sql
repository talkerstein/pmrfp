CREATE TABLE IF NOT EXISTS _project_publication_receipts (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  input_sha256 TEXT NOT NULL CHECK (length(input_sha256)=64 AND input_sha256 NOT GLOB '*[^0-9a-f]*')
);
