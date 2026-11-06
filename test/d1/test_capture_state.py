import json,unittest
from types import SimpleNamespace
from test_migrate import FixtureMixin
from test_dashboard_remote import FakeRemote
import migrate as m
import remote as r
import capture_state as s

class CaptureStateTests(FixtureMixin,unittest.TestCase):
    def ready(self):
        path=self.snapshot(self.seed());fake=FakeRemote();fake.name='pmrfp-journal-canary-20261023';self.addCleanup(fake.db.close);r.load(fake,path)
        _,_,sha=m.read_snapshot(path,self.cat);return path,fake,sha
    def test_atomic_metadata_readback_and_normal_data_verification(self):
        path,fake,sha=self.ready();self.assertIsNone(s.read(fake));state=s.write(fake,'b'*64,sha,'c'*64)
        self.assertEqual(s.read(fake),state);r.verify(fake,path)
        s.write(fake,'d'*64,sha,'e'*64);self.assertEqual(s.read(fake)['receipt_digest'],'e'*64)
    def test_wrong_manifest_cannot_advance_checkpoint(self):
        _,fake,sha=self.ready();s.write(fake,'b'*64,sha,'c'*64)
        with self.assertRaises(Exception):s.write(fake,'d'*64,'f'*64,'e'*64)
        self.assertEqual(s.read(fake)['source_sha256'],'b'*64)
    def test_unknown_schema_and_malformed_rows_fail_closed(self):
        _,fake,_=self.ready();fake.query('CREATE TABLE "'+s.TABLE+'"(customer TEXT)')
        with self.assertRaisesRegex(ValueError,'schema'):s.read(fake)
        with self.assertRaisesRegex(ValueError,'schema'):r.verify_schema(fake)
        fake.query('DROP TABLE "'+s.TABLE+'"');fake.query(s.DDL)
        with self.assertRaisesRegex(ValueError,'Incomplete'):s.read(fake)
    def test_metadata_is_not_silently_accepted_under_another_catalog(self):
        _,fake,sha=self.ready();s.write(fake,'b'*64,sha,'c'*64);fake.query('UPDATE "'+s.TABLE+'" SET catalog_sha256=?',['f'*64])
        with self.assertRaisesRegex(ValueError,'catalog'):s.read(fake)
    def test_source_history_digest_is_read_only_and_validated(self):
        calls=[]
        def runner(args,**kw):calls.append(kw['input'].decode());return SimpleNamespace(returncode=0,stdout=json.dumps({'receiptDigest':'a'*64,'acknowledgedReceipts':11}).encode())
        self.assertEqual(s.source_digest(runner)['acknowledgedReceipts'],11)
        self.assertIn('READ ONLY',calls[0]);self.assertNotIn('MAX(id)',calls[0]);self.assertNotIn('UPDATE ',calls[0]);self.assertIn('ORDER BY id',calls[0])
        with self.assertRaises(ValueError):s.source_digest(lambda *a,**k:SimpleNamespace(returncode=0,stdout=b'{"receiptDigest":"bad","acknowledgedReceipts":0}'))
    def test_unpinned_target_and_invalid_digests_never_write(self):
        _,fake,sha=self.ready();fake.name='production'
        with self.assertRaises(ValueError):s.write(fake,'b'*64,sha,'c'*64)
        self.assertIsNone(s.read(fake));fake.name='pmrfp-journal-canary-20261023'
        with self.assertRaises(ValueError):s.write(fake,'bad',sha,'c'*64)
        self.assertIsNone(s.read(fake))
    def test_expanded_pinned_target_stores_and_reads_the_same_guarded_checkpoint(self):
        _,fake,sha=self.ready();fake.name='pmrfp-rebuilt-staging-20261106'
        written=s.write(fake,sha,sha,'b'*64);self.assertEqual(s.read(fake),written)
