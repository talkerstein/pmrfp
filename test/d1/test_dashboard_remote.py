import csv,hashlib,json,os,sqlite3,sys,tempfile,unittest,io
import urllib.error
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/d1'))
import migrate as m
import dashboard_snapshot as d
import remote
from test_migrate import FixtureMixin

class FakeRemote:
    def __init__(self):self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.db.execute('PRAGMA foreign_keys=ON');self.calls=0
    def query(self,sql,params=None):
        self.calls+=1
        if ';' in sql.strip().rstrip(';'):
            self.db.executescript(sql);return [{'success':True,'results':[]}]
        cur=self.db.execute(sql,params or []);result=[dict(r) for r in cur.fetchall()];self.db.commit()
        return [{'success':True,'results':result}]
    def batch(self,items):
        results=[]
        with self.db:
            for item in items:
                cursor=self.db.execute(item['sql'],item.get('params',[]))
                results.append({'success':True,'results':[dict(row) for row in cursor.fetchall()]})
        return results

class DashboardAndRemoteTests(FixtureMixin, unittest.TestCase):
    def test_dashboard_source_checksums_and_counts(self):
        rows=self.seed();source=self.root/'export.csv'
        with source.open('w') as f:
            w=csv.DictWriter(f,fieldnames=['table_name','rows','source_md5','row_count']);w.writeheader()
            # Decode a fixture snapshot back to PostgreSQL-style row objects.
            records={t:[] for t in self.specs}
            for line in self.snapshot(rows).read_text().splitlines():
                r=json.loads(line)
                if 'table' in r:records[r['table']].append(r['row'])
            for table,rs in records.items():
                text=m.canonical(rs);w.writerow({'table_name':table,'rows':text,'source_md5':hashlib.md5(text.encode()).hexdigest(),'row_count':len(rs)})
        output=self.root/'converted.jsonl';d.convert(source,output);m.sync(output,self.target)
        source.write_text(source.read_text().replace('first@example.test','other@example.test'))
        with self.assertRaises(ValueError):d.convert(source,self.root/'corrupt.jsonl')
        self.assertFalse((self.root/'corrupt.jsonl').exists())
    def test_remote_complete_copy_and_tamper_detection(self):
        s=self.snapshot(self.seed());fake=FakeRemote();r=remote.load(fake,s)
        self.assertEqual(r['records'],3);self.assertFalse(r['cutover_ready']);remote.verify(fake,s,backup_path=self.root/'remote-backup.sqlite');m.validate(s,self.root/'remote-backup.sqlite')
        fake.db.execute("UPDATE users_profile SET full_name='changed'");fake.db.commit()
        with self.assertRaises(ValueError):remote.verify(fake,s)
        fake.db.close()
    def test_batched_readback_covers_multiple_pages_without_duplicates(self):
        rows=self.seed();template=next(iter(rows['regions'].values()))
        rows['regions']={}
        for n in range(503):
            row={**template,'id':str(n),'slug':'region-'+str(n)};rows['regions'][m.canonical([row['id']])]=row
        snapshot=self.snapshot(rows,'paged.jsonl');fake=FakeRemote();self.addCleanup(fake.db.close)
        statements=[];original=fake.batch
        def capture(items):
            statements.extend(item['sql'] for item in items if item['sql'].startswith('SELECT *'))
            return original(items)
        fake.batch=capture
        r=remote.load(fake,snapshot);self.assertEqual(r['records'],505)
        self.assertTrue(statements);self.assertFalse(any('OFFSET' in sql for sql in statements));self.assertTrue(any('WHERE (' in sql for sql in statements))
        remote.verify(fake,snapshot,backup_path=self.root/'paged.sqlite');m.validate(snapshot,self.root/'paged.sqlite')
    def test_resume_inserts_only_missing_rows_after_full_partial_readback(self):
        snapshot=self.snapshot(self.seed());fake=FakeRemote();self.addCleanup(fake.db.close);remote.load(fake,snapshot)
        fake.query('DELETE FROM users_profile');fake.query("UPDATE _migration_manifest SET state='loading'")
        original=fake.batch;inserted=[]
        def capture(items):
            inserted.extend(item for item in items if item['sql'].startswith('INSERT INTO'))
            return original(items)
        fake.batch=capture;remote.load(fake,snapshot)
        self.assertEqual(len(inserted),1);self.assertIn('users_profile',inserted[0]['sql']);remote.verify(fake,snapshot)
    def test_resume_refuses_changed_existing_rows_before_inserting_anything(self):
        snapshot=self.snapshot(self.seed());fake=FakeRemote();self.addCleanup(fake.db.close);remote.load(fake,snapshot)
        fake.query("UPDATE users_profile SET full_name='changed'");fake.query("UPDATE _migration_manifest SET state='loading'")
        original=fake.batch;inserted=[]
        def capture(items):
            inserted.extend(item for item in items if item['sql'].startswith('INSERT INTO'))
            return original(items)
        fake.batch=capture
        with self.assertRaisesRegex(ValueError,'Existing staging rows'):remote.load(fake,snapshot)
        self.assertEqual(inserted,[]);self.assertEqual(remote.manifest(fake)[0]['state'],'loading')
    def test_validated_same_snapshot_rechecks_without_reopening_loading_state(self):
        snapshot=self.snapshot(self.seed());fake=FakeRemote();self.addCleanup(fake.db.close);remote.load(fake,snapshot)
        original=fake.query;mutations=[]
        def capture(sql,params=None):
            if sql.startswith(('INSERT','UPDATE','CREATE','DELETE')):mutations.append(sql)
            return original(sql,params)
        fake.query=capture;remote.load(fake,snapshot);self.assertEqual(mutations,[])
    def test_remote_refuses_unrecognized_or_different_snapshot(self):
        fake=FakeRemote();fake.query('CREATE TABLE precious(id TEXT)')
        with self.assertRaises(ValueError):remote.load(fake,self.snapshot(self.seed()))
        fake.db.close();fake=FakeRemote();remote.load(fake,self.snapshot(self.seed()))
        with self.assertRaises(ValueError):remote.load(fake,self.snapshot(self.seed(2),'second.jsonl'))
        fake.db.close()
    def test_row_dependencies_and_cycles(self):
        catalog={'constraints':[{'type':'f','table_name':'child','definition':'FOREIGN KEY (parent_id) REFERENCES parent(id)'}]}
        rows={'child':{'c':{'id':'c','parent_id':'p'}},'parent':{'p':{'id':'p'}}}
        self.assertEqual([t for t,_ in remote.order_records(rows,catalog,{})],['parent','child'])
        rows['child']['c']['parent_id']='missing'
        with self.assertRaises(ValueError):remote.order_records(rows,catalog,{})
    def test_remote_errors_classify_failure_without_exposing_sql_or_private_values(self):
        for message,category in [('FOREIGN KEY constraint failed PRIVATE_ROW','foreign-key-constraint'),('Your account exceeded the free tier daily row write limit PRIVATE_ROW','daily-write-quota'),('Too many SQL variables PRIVATE_ROW','parameter-limit')]:
            client=remote.Remote.__new__(remote.Remote);client.token='synthetic-token';client.wrangler_auth=False;client.url='https://api.example.invalid/d1'
            body=json.dumps({'errors':[{'code':7500,'message':message}]}).encode()
            failure=urllib.error.HTTPError(client.url,400,'bad request',{},io.BytesIO(body))
            with patch('urllib.request.urlopen',side_effect=failure):
                with self.assertRaises(RuntimeError) as error:client.request('POST','/query',{'sql':'SELECT ?','params':['PRIVATE_BIND']})
            self.assertIn(category,str(error.exception));self.assertNotIn('PRIVATE_ROW',str(error.exception));self.assertNotIn('PRIVATE_BIND',str(error.exception));self.assertNotIn('synthetic-token',str(error.exception))
    def test_generated_dashboard_query_is_read_only_and_complete(self):
        query=d.sql(self.cat)
        self.assertIn('REPEATABLE READ READ ONLY',query);self.assertIn('md5(rows)',query)
        self.assertEqual(query.count(' AS table_name,'),len(self.specs))
        self.assertNotIn('raw_user_meta_data',query);self.assertNotIn('encrypted_password',query)

if __name__=='__main__':unittest.main()
