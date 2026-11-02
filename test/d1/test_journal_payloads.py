import unittest
from unittest.mock import patch
from test_migrate import FixtureMixin
from test_dashboard_remote import FakeRemote
import migrate as m
import remote as r
import journal as j
import remote_journal as q
import journal_payloads as p

class PayloadTests(FixtureMixin,unittest.TestCase):
    def prepare(self):
        first=self.snapshot(self.seed(),'before.jsonl');rows=self.seed(2)
        template=next(iter(rows['regions'].values()))
        for n in range(650):
            row={**template,'id':'payload-'+str(n),'slug':'payload-'+str(n),'name':'Private fixture é '*300+str(n)}
            rows['regions'][m.canonical([row['id']])]=row
        second=self.snapshot(rows,'after.jsonl');journal=j.plan(first,second)
        fake=FakeRemote();fake.name=q.CANARY_NAME;self.addCleanup(fake.db.close);r.load(fake,first)
        return first,second,journal,fake
    def absent(self,fake):
        self.assertEqual(fake.query("SELECT name FROM sqlite_master WHERE name=?",[p.TABLE])[0]['results'],[])
    def test_staged_forward_reverse_and_request_bounds(self):
        first,second,journal,fake=self.prepare();original=fake.batch;sizes=[]
        def record(items):
            import json
            sizes.append(len(json.dumps({'batch':items}).encode()));return original(items)
        fake.batch=record
        with patch.object(p,'LIMIT',1000):
            result=q.apply(fake,first,second,journal,self.root/'forward.sqlite')
            self.assertEqual(result['transport']['transport'],'staged-private-payloads');r.verify(fake,second);self.absent(fake)
            q.apply(fake,first,second,journal,self.root/'reverse.sqlite',reverse=True);r.verify(fake,first);self.absent(fake)
        self.assertLess(max(sizes),1_000_000)
    def test_atomic_failure_rolls_back_customer_rows_and_cleans_staging(self):
        first,second,journal,fake=self.prepare();original=fake.batch
        def failed(items):
            if items[0]['sql'].startswith('PRAGMA'):items=items[:-1]+[{'sql':"SELECT json('intentional_failure')",'params':[]}]
            return original(items)
        fake.batch=failed
        with patch.object(p,'LIMIT',1000),self.assertRaises(Exception):q.apply(fake,first,second,journal,self.root/'failed.sqlite')
        r.verify(fake,first);self.absent(fake)
    def test_missing_payload_never_silently_skips_guards_or_mutations(self):
        first,second,journal,fake=self.prepare();original=fake.batch
        def missing(items):
            if items[0]['sql'].startswith('PRAGMA'):
                fake.query('DELETE FROM "'+p.TABLE+'" WHERE id=(SELECT id FROM "'+p.TABLE+'" WHERE id<>\'metadata\' LIMIT 1)')
            return original(items)
        fake.batch=missing
        with patch.object(p,'LIMIT',1000),self.assertRaises(Exception):q.apply(fake,first,second,journal,self.root/'missing.sqlite')
        r.verify(fake,first);self.absent(fake)
    def test_lost_commit_response_is_recovered_without_duplicate_writes(self):
        first,second,journal,fake=self.prepare();original=fake.batch
        def lost(items):
            result=original(items)
            if items[0]['sql'].startswith('PRAGMA'):raise RuntimeError('response lost')
            return result
        fake.batch=lost
        with patch.object(p,'LIMIT',1000),self.assertRaisesRegex(RuntimeError,'response lost'):q.apply(fake,first,second,journal,self.root/'lost.sqlite')
        self.assertEqual(r.manifest(fake)[0]['state'],'loading');self.absent(fake);fake.batch=original
        result=q.apply(fake,first,second,journal,self.root/'recovered.sqlite');self.assertTrue(result['recovered']);r.verify(fake,second)
    def test_abandoned_owned_stage_is_removed_before_verifying_baseline(self):
        first,second,journal,fake=self.prepare();fake.batch([{'sql':p.DDL,'params':[]},{'sql':'INSERT INTO "'+p.TABLE+'" VALUES (?,?,?)','params':['metadata',p.operation_id(journal),'']}])
        with patch.object(p,'LIMIT',1000):q.apply(fake,first,second,journal,self.root/'abandoned.sqlite')
        self.absent(fake);r.verify(fake,second)
    def test_cleanup_refuses_unrecognized_schema_or_owner(self):
        first,second,journal,fake=self.prepare();fake.query('CREATE TABLE "'+p.TABLE+'"(customer TEXT)')
        with self.assertRaisesRegex(ValueError,'Unrecognized'):p.cleanup(fake,p.operation_id(journal))
        fake.query('DROP TABLE "'+p.TABLE+'"');fake.batch([{'sql':p.DDL,'params':[]},{'sql':'INSERT INTO "'+p.TABLE+'" VALUES (?,?,?)','params':['metadata','another-operation','']}])
        with self.assertRaisesRegex(ValueError,'ownership'):p.cleanup(fake,p.operation_id(journal))
        self.assertEqual(fake.query('SELECT count(*) AS n FROM "'+p.TABLE+'"')[0]['results'][0]['n'],1)
    def test_invalid_operation_and_unpinned_target_are_rejected_before_staging(self):
        with self.assertRaisesRegex(ValueError,'operation identity'):p.prepare([],"untrusted'operation")
        class Other:
            name='production'
        with self.assertRaisesRegex(ValueError,'pinned rehearsal'):p.execute(Other(),[],{})
