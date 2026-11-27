-- Rehearsal only. Do not install on the replicated preview or production.
-- Install after freezing both sides and validating the same starting snapshot.
CREATE TABLE d1_saved_rfp_rollback (
  sequence INTEGER PRIMARY KEY,
  before_row TEXT,
  after_row TEXT,
  CHECK (before_row IS NOT NULL OR after_row IS NOT NULL)
);

CREATE TRIGGER d1_saved_rfp_capture_insert AFTER INSERT ON saved_rfps
BEGIN
  INSERT INTO d1_saved_rfp_rollback (after_row)
  VALUES (json_object('id', NEW.id, 'user_id', NEW.user_id,
    'organization_id', NEW.organization_id, 'rfp_id', NEW.rfp_id, 'created_at', NEW.created_at));
END;

CREATE TRIGGER d1_saved_rfp_capture_delete AFTER DELETE ON saved_rfps
BEGIN
  INSERT INTO d1_saved_rfp_rollback (before_row)
  VALUES (json_object('id', OLD.id, 'user_id', OLD.user_id,
    'organization_id', OLD.organization_id, 'rfp_id', OLD.rfp_id, 'created_at', OLD.created_at));
END;

CREATE TRIGGER d1_saved_rfp_capture_update AFTER UPDATE ON saved_rfps
WHEN OLD.id IS NOT NEW.id OR OLD.user_id IS NOT NEW.user_id
  OR OLD.organization_id IS NOT NEW.organization_id
  OR OLD.rfp_id IS NOT NEW.rfp_id OR OLD.created_at IS NOT NEW.created_at
BEGIN
  INSERT INTO d1_saved_rfp_rollback (before_row, after_row)
  VALUES (
    json_object('id', OLD.id, 'user_id', OLD.user_id, 'organization_id', OLD.organization_id,
      'rfp_id', OLD.rfp_id, 'created_at', OLD.created_at),
    json_object('id', NEW.id, 'user_id', NEW.user_id, 'organization_id', NEW.organization_id,
      'rfp_id', NEW.rfp_id, 'created_at', NEW.created_at)
  );
END;
