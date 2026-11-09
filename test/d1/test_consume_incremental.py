import json,unittest
from unittest.mock import patch
from test_migrate import FixtureMixin
from test_dashboard_remote import FakeRemote
import migrate as m
import remote as r
import rebuild_snapshot as rebuild
import capture_state
import consume_incremental as consumer

class ConsumerTests(FixtureMixin,unittest.TestCase):
    def ready(self):
        raw=self.snapshot(self.seed(),'raw.jsonl');m.sync(raw,self.target)
        base=self.root/'base.jsonl';backup=self.root/'base.sqlite'
        original=rebuild.build(raw,self.target,backup,base,'2026-11-06T00:00:00Z')
        source=self.snapshot(self.seed(2),'capture.jsonl');records=[json.loads(line) for line in source.read_text().splitlines()]
        records[0].update(source='postgres-repeatable-read-incremental',change_capture={'protocol':1,'bootstrap':False,'ids':['9'],'base_source_sha256':original['source_snapshot_sha256'],'base_candidate_sha256':original['rebuilt_snapshot_sha256'],'base_receipt_digest':'c'*64})
        body=''.join(m.canonical(row)+'\n' for row in records[:-1]);records[-1]['sha256']=m.digest(body.encode())
        source.write_text(body+m.canonical(records[-1])+'\n');source.chmod(0o600)
        run=self.root/'run';report=consumer.prepare(source,base,backup,run)
        fake=FakeRemote();fake.name=consumer.TARGET;self.addCleanup(fake.db.close);r.load(fake,base)
        capture_state.write(fake,original['source_snapshot_sha256'],original['rebuilt_snapshot_sha256'],'c'*64)
        return source,base,run,report,fake

    def test_real_local_and_native_style_replay_recovery_keep_receipts_behind_restore(self):
        source,base,run,report,fake=self.ready();candidate=run/'candidate.jsonl';calls=[]
        def checked_ack(remote,raw,rebuilt):
            self.assertEqual((raw.resolve(),rebuilt.resolve()),(source.resolve(),candidate.resolve()));r.verify(remote,rebuilt)
            m.validate(base,run/'restored-before.sqlite');m.validate(candidate,run/'restored-after.sqlite');calls.append(True)
            return {'capturedReceipts':1}
        with patch.object(consumer.ack,'check_source_environment'),patch.object(capture_state,'source_digest',return_value={'receiptDigest':'c'*64}),patch.object(consumer.ack,'acknowledge',side_effect=checked_ack) as ack:
            with patch.object(consumer,'verify_restore',side_effect=ValueError('restore failed')):
                with self.assertRaisesRegex(ValueError,'restore failed'):consumer.commit(fake,run)
            ack.assert_not_called()
            before=(run/'native-before.sqlite').stat();after=(run/'native-after.sqlite').stat()
            result=consumer.commit(fake,run)
            self.assertTrue(result['native']['recovered']);self.assertTrue(result['backupsRestored']);self.assertEqual(calls,[True])
            self.assertEqual(before.st_ino,(run/'native-before.sqlite').stat().st_ino);self.assertEqual(after.st_ino,(run/'native-after.sqlite').stat().st_ino)

    def test_unrelated_receipt_history_refuses_native_replay(self):
        _,base,run,_,fake=self.ready()
        with patch.object(consumer.ack,'check_source_environment'),patch.object(capture_state,'source_digest',return_value={'receiptDigest':'d'*64}),patch.object(consumer.ack,'acknowledge') as ack:
            with self.assertRaisesRegex(ValueError,'receipt history'):consumer.commit(fake,run)
            ack.assert_not_called()
        self.assertFalse((run/'native-before.sqlite').exists());r.verify(fake,base)
