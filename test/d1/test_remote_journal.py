import unittest
from test_migrate import FixtureMixin
from test_dashboard_remote import FakeRemote
import migrate as m
import remote as r
import journal as j
import remote_journal as q

class RemoteJournalTests(FixtureMixin, unittest.TestCase):
    def prepare(self):
        first=self.snapshot(self.seed(),'first.jsonl');second=self.snapshot(self.seed(2),'second.jsonl')
        fake=FakeRemote();fake.name=q.CANARY_NAME;self.addCleanup(fake.db.close);r.load(fake,first)
        return first,second,j.plan(first,second),fake
    def test_atomic_forward_reverse_and_idempotent_recovery(self):
        first,second,journal,fake=self.prepare();result=q.apply(fake,first,second,journal,self.root/'forward.sqlite');self.assertFalse(result['recovered']);r.verify(fake,second);m.validate(first,self.root/'forward.sqlite')
        again=q.apply(fake,first,second,journal,self.root/'retry.sqlite');self.assertTrue(again['recovered']);self.assertFalse((self.root/'retry.sqlite').exists())
        q.apply(fake,first,second,journal,self.root/'reverse.sqlite',reverse=True);r.verify(fake,first);m.validate(second,self.root/'reverse.sqlite')
    def test_noop_never_creates_an_unrecoverable_loading_checkpoint(self):
        first,_,_,fake=self.prepare();journal=j.plan(first,first)
        result=q.apply(fake,first,first,journal,self.root/'noop.sqlite');self.assertTrue(result['noop'])
        self.assertFalse((self.root/'noop.sqlite').exists());self.assertEqual(r.manifest(fake)[0]['state'],'validated')
    def test_serving_target_and_tampered_journal_rejected_without_writes(self):
        first,second,journal,fake=self.prepare();calls=fake.calls;fake.name='pmrfp-rebuilt-staging-20261023'
        with self.assertRaisesRegex(ValueError,'synthetic canary'):q.apply(fake,first,second,journal,self.root/'bad.sqlite')
        self.assertEqual(fake.calls,calls);fake.name=q.CANARY_NAME;journal['changes'][0]['after']={'tampered':True}
        with self.assertRaises(ValueError):q.apply(fake,first,second,journal,self.root/'bad.sqlite')
        r.verify(fake,first)
    def test_interrupted_response_after_commit_is_recovered_without_reapplying(self):
        first,second,journal,fake=self.prepare();original=fake.batch
        def lost(items):
            result=original(items)
            if items[0]['sql'].startswith('PRAGMA'):raise RuntimeError('response lost')
            return result
        fake.batch=lost
        with self.assertRaisesRegex(RuntimeError,'response lost'):q.apply(fake,first,second,journal,self.root/'forward.sqlite')
        self.assertEqual(r.manifest(fake)[0]['state'],'loading');fake.batch=original
        result=q.apply(fake,first,second,journal,self.root/'retry.sqlite');self.assertTrue(result['recovered']);r.verify(fake,second)
    def test_failed_atomic_batch_preserves_original_checkpoint_and_records(self):
        first,second,journal,fake=self.prepare();original=fake.batch
        def fail(items):
            return original(items[:-1]+[{'sql':"SELECT json('invalid')",'params':[]}]) if items[0]['sql'].startswith('PRAGMA') else original(items)
        fake.batch=fail
        with self.assertRaises(Exception):q.apply(fake,first,second,journal,self.root/'forward.sqlite')
        r.verify(fake,first);m.validate(first,self.root/'forward.sqlite')
    def test_before_image_guard_catches_change_between_readback_and_atomic_write(self):
        first,second,journal,fake=self.prepare();original=fake.batch
        def raced(items):
            if items[0]['sql'].startswith('PRAGMA'):fake.query("UPDATE users_profile SET full_name='concurrent'")
            return original(items)
        fake.batch=raced
        with self.assertRaises(Exception):q.apply(fake,first,second,journal,self.root/'forward.sqlite')
        self.assertEqual(r.manifest(fake)[0]['source_sha256'],journal['before_snapshot_sha256']);self.assertEqual(fake.db.execute('SELECT full_name FROM users_profile').fetchone()[0],'concurrent')
    def test_incomplete_destination_never_promoted_to_validated(self):
        first,second,journal,fake=self.prepare();fake.query("UPDATE _migration_manifest SET source_sha256=?,state='loading'",[journal['after_snapshot_sha256']])
        with self.assertRaises(ValueError):q.apply(fake,first,second,journal,self.root/'bad.sqlite')
        self.assertEqual(r.manifest(fake)[0]['state'],'loading')

if __name__=='__main__':unittest.main()
