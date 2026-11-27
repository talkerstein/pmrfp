-- Apply to the native application candidate before starting the VPS board.
CREATE TABLE IF NOT EXISTS _native_board_revision (
  id INTEGER PRIMARY KEY CHECK (id=1),
  revision INTEGER NOT NULL CHECK (revision>=0)
);
INSERT INTO _native_board_revision(id, revision) VALUES (1, 0) ON CONFLICT(id) DO NOTHING;

CREATE TRIGGER IF NOT EXISTS native_board_post_insert AFTER INSERT ON rfp_posts
WHEN NEW.status='published' BEGIN
  UPDATE _native_board_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS native_board_post_update AFTER UPDATE OF
    id,slug,title,summary,region_id,property_type_id,city,province,deadline,is_demo,
    source_type,gc_project_name,awarded_rfp_id,published_at,created_at,status ON rfp_posts
WHEN OLD.status='published' OR NEW.status='published' BEGIN
  UPDATE _native_board_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS native_board_post_delete AFTER DELETE ON rfp_posts
WHEN OLD.status='published' BEGIN
  UPDATE _native_board_revision SET revision=revision+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS native_board_category_insert AFTER INSERT ON rfp_categories
WHEN EXISTS (SELECT 1 FROM rfp_posts WHERE id=NEW.rfp_id AND status='published') BEGIN
  UPDATE _native_board_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS native_board_category_update AFTER UPDATE ON rfp_categories
WHEN EXISTS (SELECT 1 FROM rfp_posts WHERE id IN (OLD.rfp_id,NEW.rfp_id) AND status='published') BEGIN
  UPDATE _native_board_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS native_board_category_delete AFTER DELETE ON rfp_categories
WHEN EXISTS (SELECT 1 FROM rfp_posts WHERE id=OLD.rfp_id AND status='published') BEGIN
  UPDATE _native_board_revision SET revision=revision+1 WHERE id=1;
END;
