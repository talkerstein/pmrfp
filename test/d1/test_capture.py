import json,os,unittest
from types import SimpleNamespace
from unittest.mock import patch,Mock
from test_migrate import FixtureMixin
import migrate as m
import acknowledge_capture as a

class CaptureTests(FixtureMixin,unittest.TestCase):
    def remeta(self,path,name,**updates):
        records=[m.parse_json(line) for line in path.read_text().splitlines()];records[0].update(updates)
        body=''.join(m.canonical(row)+'\n' for row in records[:-1]);records[-1]['sha256']=m.digest(body.encode())
        output=self.root/name;output.write_text(body+m.canonical(records[-1])+'\n');return output
    def snapshots(self,ids=None):
        raw=self.snapshot(self.seed(),'raw.jsonl')
        source=self.remeta(raw,'source.jsonl',source='postgres-repeatable-read',change_capture={'protocol':1,'bootstrap':True,'ids':ids if ids is not None else ['1','3']})
        _,_,sha=m.read_snapshot(source,self.cat)
        candidate=self.remeta(raw,'candidate.jsonl',source='approved-derived-rebuild',parent_snapshot_sha256=sha,rebuild_policy_sha256=m.digest((m.ROOT/'d1/rebuild-policy.json').read_bytes()))
        return source,candidate
    def env(self):return {'PGHOST':'aws-1-us-west-2.pooler.supabase.com','PGPORT':'5432','PGUSER':a.READER+'.'+a.PROJECT,'PGSSLMODE':'verify-full','PGSSLROOTCERT':'synthetic-ca-path'}
    def test_only_verified_rebuild_of_atomic_source_bootstrap_may_acknowledge(self):
        source,candidate=self.snapshots();ids,sha=a.plan(source,candidate);self.assertEqual(ids,['1','3'])
        invalid=self.remeta(candidate,'invalid.jsonl',parent_snapshot_sha256='0'*64)
        with self.assertRaises(ValueError):a.plan(source,invalid)
        no_capture=self.remeta(source,'no-capture.jsonl',change_capture={})
        with self.assertRaises(ValueError):a.plan(no_capture,candidate)
    def test_unsafe_duplicate_out_of_order_and_oversized_ids_rejected(self):
        for n,ids in enumerate([['1','1'],['3','1'],['0'],['1);DELETE FROM public.items'],[str(2**63)],list(map(str,range(1,75002)))]):
            source,candidate=self.snapshots(ids)
            with self.assertRaises(ValueError):a.plan(source,candidate)
    def test_native_mismatch_prevents_any_source_acknowledgement(self):
        source,candidate=self.snapshots();runner=Mock();remote=SimpleNamespace(name=a.TARGET)
        with patch.dict(os.environ,self.env()),patch.object(a.r,'verify',side_effect=ValueError('Native mismatch')):
            with self.assertRaises(ValueError):a.acknowledge(remote,source,candidate,runner)
        runner.assert_not_called()
    def test_acknowledgements_are_bounded_idempotent_and_contain_no_customer_writes(self):
        source,candidate=self.snapshots([str(n) for n in range(1,1202)]);calls=[]
        def runner(args,**kwargs):
            sql=kwargs['input'].decode();calls.append((args,sql));self.assertNotIn('UPDATE public.',sql);self.assertNotIn('DELETE FROM',sql)
            return SimpleNamespace(returncode=0,stdout=b'0')
        with patch.dict(os.environ,self.env()),patch.object(a.r,'verify',return_value={'records':3}) as verify:
            report=a.acknowledge(SimpleNamespace(name=a.TARGET),source,candidate,runner)
        self.assertEqual(len(calls),3);self.assertEqual(report['newAcknowledgements'],0);self.assertEqual(report['capturedReceipts'],1201);verify.assert_called_once()
        self.assertTrue(all('BEGIN READ WRITE' in sql and 'd1_migration.acknowledge' in sql for _,sql in calls))
    def test_wrong_target_or_unverified_source_connection_never_acknowledges(self):
        source,candidate=self.snapshots();runner=Mock()
        with self.assertRaises(ValueError):a.acknowledge(SimpleNamespace(name='production'),source,candidate,runner)
        with patch.dict(os.environ,{**self.env(),'PGSSLMODE':'require'}):
            with self.assertRaises(ValueError):a.acknowledge(SimpleNamespace(name=a.TARGET),source,candidate,runner)
        runner.assert_not_called()
    def test_bootstrap_metadata_sql_polls_all_pending_ids_without_watermark(self):
        sql=m.capture_metadata_sql({'kind':'meta'})
        self.assertIn('acknowledged_at IS NULL',sql);self.assertIn('id::text ORDER BY id',sql);self.assertNotIn('id>',sql)
        self.assertIn("'bootstrap',true",sql)

if __name__=='__main__':unittest.main()
