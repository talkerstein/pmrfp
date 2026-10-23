import copy, sqlite3, unittest
from test_migrate import FixtureMixin
import migrate as m
import journal as j

class JournalTests(FixtureMixin, unittest.TestCase):
    def prepare(self):
        first=self.snapshot(self.seed(),'first.jsonl');second=self.snapshot(self.seed(2),'second.jsonl')
        m.sync(first,self.target)
        return first,second,j.plan(first,second)
    def rehash(self,journal):
        journal['sha256']=m.digest(m.canonical({k:v for k,v in journal.items() if k!='sha256'}).encode())
    def test_forward_reverse_restore_and_exact_backups(self):
        first,second,journal=self.prepare();self.assertGreaterEqual(len(journal['changes']),3)
        result=j.apply(journal,self.target,self.root/'forward.sqlite');self.assertFalse(result['cutover_ready']);m.validate(second,self.target);m.validate(first,self.root/'forward.sqlite')
        j.apply(journal,self.target,self.root/'reverse.sqlite',reverse=True);m.validate(first,self.target);m.validate(second,self.root/'reverse.sqlite')
    def test_serving_checkpoint_is_not_silently_left_with_a_stale_manifest(self):
        first,_,journal=self.prepare()
        with sqlite3.connect(self.target) as db:db.execute('CREATE TABLE _migration_manifest(id INTEGER PRIMARY KEY)')
        with self.assertRaisesRegex(ValueError,'Serving checkpoints'):j.apply(journal,self.target,self.root/'serving.sqlite')
        m.validate(first,self.target);self.assertFalse((self.root/'serving.sqlite').exists())
    def test_wrong_baseline_and_duplicate_replay_are_rejected(self):
        first,second,journal=self.prepare();j.apply(journal,self.target,self.root/'first.sqlite')
        with self.assertRaisesRegex(ValueError,'baseline'):j.apply(journal,self.target,self.root/'duplicate.sqlite')
        self.assertFalse((self.root/'duplicate.sqlite').exists());m.validate(second,self.target)
    def test_corrupt_journal_rejected_before_backup(self):
        first,_,journal=self.prepare();journal['changes'][0]['after']={'private':'tampered'}
        with self.assertRaisesRegex(ValueError,'checksum'):j.apply(journal,self.target,self.root/'bad.sqlite')
        m.validate(first,self.target);self.assertFalse((self.root/'bad.sqlite').exists())
    def test_schema_mismatch_rejected(self):
        first,_,journal=self.prepare();journal['schema_sha256']='b'*64;self.rehash(journal)
        with self.assertRaisesRegex(ValueError,'schema'):j.apply(journal,self.target,self.root/'bad.sqlite')
        m.validate(first,self.target)
    def test_before_images_and_duplicate_keys_rejected(self):
        first,_,journal=self.prepare();bad=copy.deepcopy(journal);bad['changes'][0]['before']=None;self.rehash(bad)
        with self.assertRaises(ValueError):j.apply(bad,self.target,self.root/'bad.sqlite')
        journal['changes'].append(journal['changes'][0]);self.rehash(journal)
        with self.assertRaisesRegex(ValueError,'duplicate'):j.apply(journal,self.target,self.root/'duplicate.sqlite')
        m.validate(first,self.target)
    def test_destination_checksum_rejected_before_backup(self):
        first,_,journal=self.prepare();journal['after_rows_sha256']='b'*64;self.rehash(journal)
        with self.assertRaisesRegex(ValueError,'destination'):j.apply(journal,self.target,self.root/'bad.sqlite')
        m.validate(first,self.target);self.assertFalse((self.root/'bad.sqlite').exists())
    def test_backup_never_overwritten(self):
        first,_,journal=self.prepare();backup=self.root/'precious.sqlite';backup.write_text('precious')
        with self.assertRaises(FileExistsError):j.apply(journal,self.target,backup)
        self.assertEqual(backup.read_text(),'precious');m.validate(first,self.target)
    def test_noop_is_reversible(self):
        first=self.snapshot(self.seed());m.sync(first,self.target);journal=j.plan(first,first)
        self.assertEqual(journal['changes'],[]);j.apply(journal,self.target,self.root/'noop.sqlite');m.validate(first,self.target)
    def test_cascade_reparenting_restores_the_surviving_child(self):
        db=m.connect(':memory:');db.executescript(m.SCHEMA.read_text())
        db.execute("INSERT INTO rfp_posts(id,title,slug,keep_alive_token) VALUES ('old','Old','old','token-old'),('new','New','new','token-new')")
        db.execute("INSERT INTO trade_categories(id,name,slug) VALUES ('trade','Trade','trade')")
        db.execute("INSERT INTO rfp_categories(id,rfp_id,category_id) VALUES ('link','old','trade')")
        before=m.read_target(db,self.specs)
        db.execute("UPDATE rfp_categories SET rfp_id='new' WHERE id='link'")
        db.execute("DELETE FROM rfp_posts WHERE id='old'")
        after=m.read_target(db,self.specs);db.close()
        first=self.snapshot(before,'cascade-before.jsonl');second=self.snapshot(after,'cascade-after.jsonl');m.sync(first,self.target)
        journal=j.plan(first,second);j.apply(journal,self.target,self.root/'cascade-forward.sqlite');m.validate(second,self.target)
        j.apply(journal,self.target,self.root/'cascade-reverse.sqlite',reverse=True);m.validate(first,self.target)
    def test_invalid_relationship_rolls_back_transaction(self):
        first,_,journal=self.prepare();rows=self.seed(2);rows['_auth_users']={};invalid=self.snapshot(rows,'invalid.jsonl');journal=j.plan(first,invalid)
        with self.assertRaises(ValueError):j.apply(journal,self.target,self.root/'invalid-backup.sqlite')
        m.validate(first,self.target);m.validate(first,self.root/'invalid-backup.sqlite')

if __name__=='__main__':unittest.main()
