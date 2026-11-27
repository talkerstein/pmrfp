import sqlite3
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/d1'))
from rehearse_saved_rfp_rollback import replay

SCHEMA = (ROOT / 'd1/production-staging-copy-2026-11-05.sql').read_text()
START = SCHEMA.index('CREATE TABLE "saved_rfps"')
SAVED_RFPS = SCHEMA[START:SCHEMA.index('\n);', START) + 3]
CAPTURE = (ROOT / 'd1/saved-rfp-rollback-rehearsal.sql').read_text()


class SavedRfpRollbackTest(unittest.TestCase):
    def database(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript("""
          PRAGMA foreign_keys=ON;
          CREATE TABLE users_profile(id TEXT PRIMARY KEY);
          CREATE TABLE organizations(id TEXT PRIMARY KEY);
          CREATE TABLE rfp_posts(id TEXT PRIMARY KEY);
          INSERT INTO users_profile VALUES ('a'),('b');
          INSERT INTO organizations VALUES ('org');
          INSERT INTO rfp_posts VALUES ('rfp1'),('rfp2');
        """ + SAVED_RFPS + """
          INSERT INTO saved_rfps VALUES ('old','a','org','rfp1','2026-11-09T00:00:00Z');
        """)
        return db

    def fixture(self):
        new = self.database()
        new.executescript(CAPTURE)
        new.executescript("""
          INSERT INTO saved_rfps VALUES ('new','b',NULL,'rfp1','2026-11-09T01:00:00Z');
          INSERT INTO saved_rfps VALUES ('duplicate','b',NULL,'rfp1','2026-11-09T01:01:00Z')
            ON CONFLICT(user_id,rfp_id) DO NOTHING;
          BEGIN;
          INSERT INTO saved_rfps VALUES ('aborted','b',NULL,'rfp2','2026-11-09T01:02:00Z');
          ROLLBACK;
          DELETE FROM saved_rfps WHERE id='old';
          INSERT INTO saved_rfps VALUES ('rebook','a','org','rfp1','2026-11-09T01:03:00Z');
          UPDATE saved_rfps SET organization_id=NULL WHERE id='rebook';
          UPDATE saved_rfps SET organization_id=NULL WHERE id='rebook';
        """)
        entries = new.execute('SELECT * FROM d1_saved_rfp_rollback ORDER BY sequence').fetchall()
        return new, entries

    def test_replays_save_unsave_resave_and_update_without_retry_or_abort_events(self):
        new, entries = self.fixture()
        old = self.database()
        self.assertEqual(len(entries), 4)
        self.assertEqual(replay(old, entries, 4), 4)
        self.assertEqual(
            old.execute('SELECT * FROM saved_rfps ORDER BY id').fetchall(),
            new.execute('SELECT * FROM saved_rfps ORDER BY id').fetchall(),
        )

    def test_source_conflict_rolls_back_preceding_changes(self):
        _, entries = self.fixture()
        old = self.database()
        old.execute("UPDATE saved_rfps SET organization_id=NULL WHERE id='old'")
        old.commit()
        before = old.execute('SELECT * FROM saved_rfps').fetchall()
        with self.assertRaisesRegex(ValueError, 'differs from journal baseline'):
            replay(old, entries, 4)
        self.assertEqual(old.execute('SELECT * FROM saved_rfps').fetchall(), before)

    def test_missing_tail_rolls_back_even_if_each_present_event_is_valid(self):
        _, entries = self.fixture()
        old = self.database()
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            replay(old, entries[:-1], 4)
        self.assertEqual(old.execute('SELECT id FROM saved_rfps').fetchall(), [('old',)])


if __name__ == '__main__':
    unittest.main()
