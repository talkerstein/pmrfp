import unittest,json,sqlite3
from unittest.mock import patch
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
    def test_wide_before_images_work_under_native_expression_depth_limit(self):
        db=m.connect(':memory:');db.executescript(m.SCHEMA.read_text())
        db.execute("INSERT INTO rfp_posts(id,title,slug,summary,keep_alive_token) VALUES ('test-rfp','Test','test-rfp','Before','synthetic-token')")
        db.execute("INSERT INTO regions(id,name,slug) VALUES ('region','Region','region')")
        before=m.read_target(db,self.specs);db.execute("UPDATE rfp_posts SET summary='After'")
        for n in range(19):db.execute('INSERT INTO regions(id,name,slug) VALUES(?,?,?)',('new-'+str(n),'New','new-'+str(n)))
        after=m.read_target(db,self.specs);db.close()
        first=self.snapshot(before,'wide-before.jsonl');second=self.snapshot(after,'wide-after.jsonl');journal=j.plan(first,second)
        fake=FakeRemote();fake.name=q.CANARY_NAME;self.addCleanup(fake.db.close);r.load(fake,first)
        if not hasattr(fake.db,'setlimit'):self.skipTest('SQLite runtime does not expose expression-depth limits')
        fake.db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,64)
        q.apply(fake,first,second,journal,self.root/'wide.sqlite');r.verify(fake,second)
    def test_before_image_guards_are_packed_within_parameter_limits(self):
        first=self.snapshot(self.seed(),'before-packed.jsonl');rows=self.seed(2);template=next(iter(rows['regions'].values()))
        for n in range(220):
            row={**template,'id':'packed-'+str(n),'slug':'packed-'+str(n)};rows['regions'][m.canonical([row['id']])]=row
        second=self.snapshot(rows,'after-packed.jsonl');journal=j.plan(first,second)
        before,_,_=m.read_snapshot(first,self.cat);after,_,_=m.read_snapshot(second,self.cat)
        batch=q.statements(journal,before,after,self.specs)
        self.assertTrue(all(len(item['params'])<=100 for item in batch));self.assertTrue(all(item['sql'].count('SELECT')<=21 for item in batch));self.assertLess(len(batch),len(journal['changes'])+30)
        fake=FakeRemote();fake.name=q.CANARY_NAME;self.addCleanup(fake.db.close);r.load(fake,first)
        q.apply(fake,first,second,journal,self.root/'packed.sqlite');r.verify(fake,second)
    def test_noop_never_creates_an_unrecoverable_loading_checkpoint(self):
        first,_,_,fake=self.prepare();journal=j.plan(first,first)
        result=q.apply(fake,first,first,journal,self.root/'noop.sqlite');self.assertTrue(result['noop'])
        self.assertFalse((self.root/'noop.sqlite').exists());self.assertEqual(r.manifest(fake)[0]['state'],'validated')
    def test_large_json_packed_batch_roundtrips_and_rejects_raced_before_image(self):
        first=self.snapshot(self.seed(),'large-before.jsonl');rows=self.seed(2);template=next(iter(rows['regions'].values()))
        for n in range(650):
            row={**template,'id':'large-'+str(n),'slug':'large-'+str(n),'name':'Quoted " text \\ and Unicode é '+str(n)};rows['regions'][m.canonical([row['id']])]=row
        second=self.snapshot(rows,'large-after.jsonl');journal=j.plan(first,second)
        before,_,_=m.read_snapshot(first,self.cat);after,_,_=m.read_snapshot(second,self.cat)
        batch=q.statements(journal,before,after,self.specs)
        self.assertLess(len(batch),50);self.assertTrue(any('json_each' in item['sql'] for item in batch))
        self.assertTrue(all(len(p.encode())<=90000 for item in batch for p in item['params'] if isinstance(p,str)))
        fake=FakeRemote();fake.name=q.CANARY_NAME;self.addCleanup(fake.db.close);r.load(fake,first)
        q.apply(fake,first,second,journal,self.root/'large-forward.sqlite');r.verify(fake,second)
        q.apply(fake,first,second,journal,self.root/'large-reverse.sqlite',reverse=True);r.verify(fake,first)
        original=fake.batch
        def raced(items):
            if items[0]['sql'].startswith('PRAGMA'):fake.query("UPDATE users_profile SET full_name='race'")
            return original(items)
        fake.batch=raced
        with self.assertRaises(Exception):q.apply(fake,first,second,journal,self.root/'large-race.sqlite')
        self.assertEqual(r.manifest(fake)[0]['source_sha256'],journal['before_snapshot_sha256'])
        self.assertEqual(fake.db.execute("SELECT count(*) FROM regions WHERE id LIKE 'large-%'").fetchone()[0],0)
    def test_json_payload_chunks_are_bounded(self):
        self.assertEqual(len(list(q.json_chunks([[str(n)] for n in range(201)]))),3)
        with self.assertRaisesRegex(ValueError,'payload bound'):list(q.json_chunks([['x'*90000]]))
        self.assertEqual(len(next(q.json_chunks([['x'*89994]])).encode()),90000)
        with self.assertRaisesRegex(ValueError,'payload bound'):list(q.json_chunks([['x'*89995]]))
    def test_packed_composite_deletes_use_primary_key_lookups(self):
        db=sqlite3.connect(':memory:');self.addCleanup(db.close)
        db.execute('CREATE TABLE entries(a TEXT NOT NULL,b TEXT NOT NULL,value TEXT,PRIMARY KEY(a,b))')
        db.executemany('INSERT INTO entries VALUES(?,?,?)',[('a','1','keep'),('a','2','remove'),('b','1','remove')])
        actions=[('delete','entries',('a','b'),'DELETE FROM entries WHERE a=? AND b=?',key) for key in [['a','2'],['b','1']]]
        batch=q.packed_mutations(actions);self.assertEqual(len(batch),1);item=batch[0]
        plan=[row[3] for row in db.execute('EXPLAIN QUERY PLAN '+item['sql'],item['params'])]
        self.assertTrue(any(detail.startswith('SEARCH entries USING ') and 'INDEX' in detail and '(a=? AND b=?)' in detail for detail in plan),plan)
        db.execute(item['sql'],item['params']);self.assertEqual(db.execute('SELECT * FROM entries').fetchall(),[('a','1','keep')])
    def test_large_integer_is_rejected_before_json_packing(self):
        first=self.snapshot(self.seed(),'integer-before.jsonl');rows=self.seed(2);template=next(iter(rows['regions'].values()))
        for n in range(650):
            row={**template,'id':'integer-'+str(n),'slug':'integer-'+str(n),'sort_order':2**54 if n==0 else n};rows['regions'][m.canonical([row['id']])]=row
        second=self.snapshot(rows,'integer-after.jsonl');journal=j.plan(first,second)
        before,_,_=m.read_snapshot(first,self.cat);after,_,_=m.read_snapshot(second,self.cat)
        with self.assertRaisesRegex(ValueError,'Unsafe integer'):q.statements(journal,before,after,self.specs)
    def approved_snapshot(self,path,name):
        records=[m.parse_json(line) for line in path.read_text().splitlines()]
        records[0].update(source='approved-derived-rebuild',parent_snapshot_sha256=records[-1]['sha256'],rebuild_policy_sha256=m.digest((m.ROOT/'d1/rebuild-policy.json').read_bytes()))
        body=''.join(m.canonical(record)+'\n' for record in records[:-1]);records[-1]['sha256']=m.digest(body.encode())
        output=self.root/name;output.write_text(body+m.canonical(records[-1])+'\n');return output
    def test_copied_preview_requires_opt_in_and_approved_rebuild_provenance(self):
        first=self.approved_snapshot(self.snapshot(self.seed(),'raw-before.jsonl'),'before-approved.jsonl')
        second=self.approved_snapshot(self.snapshot(self.seed(2),'raw-after.jsonl'),'after-approved.jsonl')
        journal=j.plan(first,second);fake=FakeRemote();fake.name=q.COPIED_PREVIEW_NAME;self.addCleanup(fake.db.close);r.load(fake,first)
        with self.assertRaises(ValueError):q.apply(fake,first,second,journal,self.root/'not-approved.sqlite')
        q.apply(fake,first,second,journal,self.root/'forward-approved.sqlite',allow_copied_preview=True);r.verify(fake,second)
        q.apply(fake,first,second,journal,self.root/'reverse-approved.sqlite',reverse=True,allow_copied_preview=True);r.verify(fake,first)
    def test_copied_preview_rejects_synthetic_metadata_and_unsafe_binding_before_mutation(self):
        first,second,journal,fake=self.prepare();fake.name=q.COPIED_PREVIEW_NAME;calls=fake.calls
        with self.assertRaisesRegex(ValueError,'approved rebuild'):q.apply(fake,first,second,journal,self.root/'bad-source.sqlite',allow_copied_preview=True)
        self.assertEqual(fake.calls,calls)
        config=self.root/'workers/d1-api';config.mkdir(parents=True);(config/'wrangler.copy-preview.jsonc').write_text(json.dumps({'name':'pmrfp-d1-copied-read-preview','vars':{'SAVED_RFPS_MODE':'sandbox-write'},'d1_databases':[{'database_id':'wrong'}]}))
        with patch.object(m,'ROOT',self.root):
            with self.assertRaisesRegex(ValueError,'read-only configuration'):q.apply(fake,first,second,journal,self.root/'bad-binding.sqlite',allow_copied_preview=True)
        self.assertEqual(fake.calls,calls)
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
