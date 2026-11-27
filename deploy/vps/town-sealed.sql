-- The VPS transport is server-only. The application exposes counts, individual
-- submitter-owned quotes and two-person approval through separate scoped queries.
CREATE TABLE IF NOT EXISTS _town_sealed_quotes (
  id TEXT PRIMARY KEY,
  rfp_id TEXT NOT NULL REFERENCES rfp_posts(id) ON DELETE CASCADE,
  trade_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submitted_by_user_id TEXT REFERENCES users_profile(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn','opened')),
  message TEXT CHECK(message IS NULL OR length(message) BETWEEN 1 AND 2000),
  relevant_experience TEXT CHECK(relevant_experience IS NULL OR length(relevant_experience)<=2000),
  availability TEXT CHECK(availability IS NULL OR length(availability)<=500),
  quote_amount REAL CHECK(quote_amount IS NULL OR quote_amount BETWEEN 0 AND 1000000000),
  quote_kind TEXT CHECK(quote_kind IS NULL OR quote_kind IN ('estimate','firm')),
  quote_notes TEXT CHECK(quote_notes IS NULL OR length(quote_notes)<=2000),
  start_date TEXT,
  case_study_ids TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid(case_study_ids) AND json_type(case_study_ids)='array' AND json_array_length(case_study_ids)<=3),
  lang TEXT CHECK(lang IS NULL OR lang IN ('en','fr','es')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 1000),
  interest_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  withdrawn_at TEXT,
  opened_at TEXT,
  UNIQUE(rfp_id,trade_organization_id),
  CHECK((status='withdrawn' AND message IS NULL AND relevant_experience IS NULL AND availability IS NULL
    AND quote_amount IS NULL AND quote_kind IS NULL AND quote_notes IS NULL AND start_date IS NULL AND case_study_ids='[]')
    OR (status<>'withdrawn' AND message IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS _town_sealed_quote_rfp ON _town_sealed_quotes(rfp_id,status);

CREATE TABLE IF NOT EXISTS _town_sealed_openings (
  rfp_id TEXT PRIMARY KEY REFERENCES rfp_posts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('requested','cancelled','expired','opened')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK(attempt>=1),
  requested_by TEXT REFERENCES users_profile(id) ON DELETE SET NULL,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  witness_name TEXT CHECK(witness_name IS NULL OR length(witness_name) BETWEEN 2 AND 120),
  witness_email TEXT CHECK(witness_email IS NULL OR (length(witness_email)<=254 AND witness_email=lower(witness_email))),
  witness_token_hash TEXT CHECK(witness_token_hash IS NULL OR length(witness_token_hash)=64),
  confirmed_by TEXT REFERENCES users_profile(id) ON DELETE SET NULL,
  confirmed_method TEXT CHECK(confirmed_method IS NULL OR confirmed_method IN ('member','witness')),
  witness_confirmed_name TEXT CHECK(witness_confirmed_name IS NULL OR length(witness_confirmed_name) BETWEEN 2 AND 120),
  opened_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK((witness_email IS NULL)=(witness_name IS NULL)),
  CHECK((status='opened')=(opened_at IS NOT NULL)),
  CHECK(status<>'opened' OR (witness_token_hash IS NULL AND confirmed_method IS NOT NULL))
);

CREATE TRIGGER IF NOT EXISTS _town_sealed_interest_guard BEFORE INSERT ON rfp_interests
WHEN EXISTS(SELECT 1 FROM rfp_posts WHERE id=NEW.rfp_id AND sealed=1)
  AND NOT EXISTS(SELECT 1 FROM _town_sealed_openings WHERE rfp_id=NEW.rfp_id AND status='opened')
BEGIN
  SELECT RAISE(ABORT,'sealed_quote_box_closed');
END;

CREATE TRIGGER IF NOT EXISTS _town_sealed_flag_guard BEFORE UPDATE OF sealed ON rfp_posts
WHEN OLD.sealed<>NEW.sealed AND (OLD.status NOT IN ('draft','pending_review')
  OR EXISTS(SELECT 1 FROM _town_sealed_quotes WHERE rfp_id=OLD.id))
BEGIN
  SELECT RAISE(ABORT,'sealed_flag_frozen');
END;

CREATE TRIGGER IF NOT EXISTS _town_sealed_quote_insert_log AFTER INSERT ON _town_sealed_quotes
BEGIN
  INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,event,detail,created_at)
    SELECT id,posted_by_organization_id,buyer_key,'sealed_quote_received',
      json_object('quote',NEW.id,'version',NEW.version),NEW.updated_at FROM rfp_posts WHERE id=NEW.rfp_id;
END;

CREATE TRIGGER IF NOT EXISTS _town_sealed_quote_change_log AFTER UPDATE ON _town_sealed_quotes
WHEN NEW.status IN ('active','withdrawn')
BEGIN
  INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,event,detail,created_at)
    SELECT id,posted_by_organization_id,buyer_key,
      CASE WHEN NEW.status='withdrawn' THEN 'sealed_quote_withdrawn' WHEN OLD.status='withdrawn'
        THEN 'sealed_quote_received' ELSE 'sealed_quote_replaced' END,
      json_object('quote',NEW.id,'version',NEW.version),NEW.updated_at FROM rfp_posts WHERE id=NEW.rfp_id;
END;

CREATE TRIGGER IF NOT EXISTS _town_sealed_open_request_log AFTER INSERT ON _town_sealed_openings
BEGIN
  INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail,created_at)
    SELECT id,posted_by_organization_id,buyer_key,NEW.requested_by,'opening_requested',
      json_object('witness',NEW.witness_name,'expires_at',NEW.expires_at,'attempt',NEW.attempt),NEW.updated_at
    FROM rfp_posts WHERE id=NEW.rfp_id;
END;

CREATE TRIGGER IF NOT EXISTS _town_sealed_open_transition_log AFTER UPDATE ON _town_sealed_openings
WHEN NEW.status<>'opened'
BEGIN
  INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail,created_at)
    SELECT id,posted_by_organization_id,buyer_key,NEW.requested_by,
      CASE WHEN NEW.status='cancelled' THEN 'opening_cancelled' WHEN NEW.status='expired' THEN 'opening_expired'
        WHEN NEW.attempt>OLD.attempt THEN 'opening_requested' ELSE 'opening_link_resent' END,
      json_object('witness',NEW.witness_name,'expires_at',NEW.expires_at,'attempt',NEW.attempt),NEW.updated_at
    FROM rfp_posts WHERE id=NEW.rfp_id;
END;

-- Only a guarded opening update reaches this trigger. Materialization, the
-- audit trail, and confirmation all commit or roll back together.
CREATE TRIGGER IF NOT EXISTS _town_sealed_materialize AFTER UPDATE OF status ON _town_sealed_openings
WHEN OLD.status='requested' AND NEW.status='opened'
BEGIN
  INSERT INTO rfp_interests(id,rfp_id,trade_organization_id,submitted_by_user_id,message,relevant_experience,
    availability,quote_amount,quote_kind,quote_notes,start_date,case_study_ids,lang,created_at,updated_at)
    SELECT id,rfp_id,trade_organization_id,submitted_by_user_id,message,relevant_experience,
      availability,CASE WHEN quote_amount IS NULL THEN NULL WHEN round(quote_amount,2)=1000000000 THEN '1000000000'
        ELSE printf('%013.2f',quote_amount) END,quote_kind,quote_notes,start_date,case_study_ids,lang,updated_at,NEW.updated_at
    FROM _town_sealed_quotes WHERE rfp_id=NEW.rfp_id AND status='active'
    ON CONFLICT(rfp_id,trade_organization_id) DO NOTHING;
  UPDATE _town_sealed_quotes SET status='opened',opened_at=NEW.opened_at,updated_at=NEW.updated_at,
    interest_id=(SELECT i.id FROM rfp_interests i WHERE i.rfp_id=NEW.rfp_id
      AND i.trade_organization_id=_town_sealed_quotes.trade_organization_id)
    WHERE rfp_id=NEW.rfp_id AND status='active';
  INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail,created_at)
    SELECT id,posted_by_organization_id,buyer_key,NEW.confirmed_by,
      CASE WHEN NEW.confirmed_method='witness' THEN 'opening_witnessed' ELSE 'opening_confirmed' END,
      json_object('witness',NEW.witness_confirmed_name),NEW.updated_at
    FROM rfp_posts WHERE id=NEW.rfp_id;
  INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail,created_at)
    SELECT id,posted_by_organization_id,buyer_key,NEW.confirmed_by,'quotes_opened',
      (SELECT json_object('count',count(*),'method',NEW.confirmed_method,
        'responses',json_group_array(json_object('quote',id,'response',interest_id)))
       FROM _town_sealed_quotes WHERE rfp_id=NEW.rfp_id AND status='opened'),NEW.updated_at
    FROM rfp_posts WHERE id=NEW.rfp_id;
END;

-- Attach a private published project only at opening, after the bidder chose
-- it and while both the project and quote still belong to the bidder.
CREATE TRIGGER IF NOT EXISTS _town_sealed_project_shares AFTER UPDATE OF status ON _town_sealed_openings
WHEN OLD.status='requested' AND NEW.status='opened'
BEGIN
  INSERT INTO case_study_share_links(id,case_study_id,organization_id,token,label,created_by_user_id,created_at)
  SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)
      ||'-8'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
    p.id,p.organization_id,lower(hex(randomblob(16))),substr('Sealed quote: '||r.title,1,80),q.submitted_by_user_id,NEW.opened_at
  FROM _town_sealed_quotes q JOIN rfp_posts r ON r.id=q.rfp_id JOIN json_each(q.case_study_ids) c
    JOIN case_studies p ON p.id=c.value AND p.organization_id=q.trade_organization_id
  WHERE q.rfp_id=NEW.rfp_id AND q.status IN ('active','opened')
    AND p.status='published' AND p.visibility='private'
    AND NOT EXISTS(SELECT 1 FROM case_study_share_links l WHERE l.case_study_id=p.id AND l.revoked_at IS NULL);
END;
