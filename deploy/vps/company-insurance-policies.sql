CREATE TABLE IF NOT EXISTS _organization_insurance_policies (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_number TEXT NOT NULL CHECK (length(trim(policy_number)) BETWEEN 1 AND 80)
);
