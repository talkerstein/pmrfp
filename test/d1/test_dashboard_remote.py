import csv,hashlib,json,os,sqlite3,sys,tempfile,unittest
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
        with self.db:
            for item in items:self.db.execute(item['sql'],item.get('params',[]))
        return [{'success':True} for _ in items]

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
    def test_generated_dashboard_query_is_read_only_and_complete(self):
        query=d.sql(self.cat)
        self.assertIn('REPEATABLE READ READ ONLY',query);self.assertIn('md5(rows)',query)
        self.assertEqual(query.count(' AS table_name,'),84)
        self.assertNotIn('raw_user_meta_data',query);self.assertNotIn('encrypted_password',query)

if __name__=='__main__':unittest.main()
