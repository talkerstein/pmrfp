import json,unittest
from types import SimpleNamespace
from unittest.mock import patch
import test_migrate  # Adds scripts/d1 to the import path.
import inspect_sync as health

class SyncHealthTests(unittest.TestCase):
    def setUp(self):
        self.remote=SimpleNamespace(name=health.TARGET)
        self.state={'candidate_sha256':'a'*64,'receipt_digest':'b'*64}
        self.manifest=[{'source_sha256':'a'*64,'state':'validated'}]
        self.raw={'pendingReceipts':123,'oldestPendingAt':'2026-11-06T00:00:00.92453+00:00','latestAcknowledgedAt':None,'readerExpires':'2099-01-01T00:00:00+00:00','receiptDigest':'b'*64,'acknowledgedReceipts':105321}
    def runner(self,*args,**kwargs):
        sql=kwargs['input'].decode();self.assertIn('REPEATABLE READ READ ONLY',sql)
        self.assertNotRegex(sql,r'(?im)^\s*(update|insert|delete|alter|create|drop)\s')
        return SimpleNamespace(returncode=0,stdout=json.dumps(self.raw).encode())
    def check(self,manifests=None):
        with patch.object(health.ack,'check_source_environment'),patch.object(health.r,'manifest',side_effect=manifests or [self.manifest,self.manifest]),patch.object(health.capture_state,'read',return_value=self.state):
            return health.inspect(self.remote,self.runner)
    def test_consistent_backlog_is_safe_to_capture(self):
        report=self.check();self.assertTrue(report['readyForCapture']);self.assertEqual(report['pendingReceipts'],123);self.assertEqual(report['writes'],0)
    def test_mid_replay_or_receipt_divergence_blocks_a_fresh_capture(self):
        loading=[{'source_sha256':'c'*64,'state':'loading'}]
        self.assertEqual(self.check([self.manifest,loading])['reason'],'checkpoint_changed_during_check')
        self.assertEqual(self.check([loading,loading])['reason'],'native_replay_or_checkpoint_incomplete')
        self.raw['receiptDigest']='d'*64;self.assertEqual(self.check()['reason'],'source_receipt_history_differs')
