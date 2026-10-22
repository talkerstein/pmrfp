import hashlib, json, os, sqlite3, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/d1'))
import migrate as m
from schema import generate

class FixtureMixin:
    def setUp(self):
        self.addCleanup(setattr,m,'CATALOG',m.CATALOG);self.addCleanup(setattr,m,'SCHEMA',m.SCHEMA)
        m.CATALOG=m.ROOT/'d1/postgres-catalog.json';m.SCHEMA=m.ROOT/'d1/0001-staging-copy.sql'
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.target=self.root/'target.sqlite';self.cat=m.load_catalog();self.specs=m.table_specs(self.cat)
    def seed(self,version=1):
        db=m.connect(':memory:');db.executescript(m.SCHEMA.read_text())
        db.execute("INSERT INTO _auth_users(id) VALUES ('11111111-1111-4111-8111-111111111111')")
        db.execute("INSERT INTO users_profile(id,email,full_name) VALUES ('11111111-1111-4111-8111-111111111111','first@example.test',?)",('one' if version==1 else 'two',))
        if version==1:db.execute("INSERT INTO regions(id,name,slug) VALUES ('22222222-2222-4222-8222-222222222222','Test Region','test-region')")
        if version==2:db.execute("INSERT INTO regions(id,name,slug) VALUES ('33333333-3333-4333-8333-333333333333','Other Region','other-region')")
        rows=m.read_target(db,self.specs);db.close();return rows
    def snapshot(self,rows,name='snapshot.jsonl'):
        lines=[m.canonical({'kind':'meta','source':'synthetic-test','catalog_sha256':m.digest(m.CATALOG.read_bytes()),'tables':sorted(self.specs)})+'\n']
        for table,rs in rows.items():
            for row in rs.values():
                r={}
                for col in self.specs[table]['columns']:
                    k=col['column_name'];v=row[k];t=col['udt_name']
                    if v is not None and t=='bool':v=bool(v)
                    if v is not None and (t.startswith('_') or t=='jsonb'):v=json.loads(v)
                    r[k]=v
                lines.append(m.canonical({'table':table,'row':r})+'\n')
        h=m.digest(''.join(lines).encode());lines.append(m.canonical({'kind':'footer','sha256':h,'counts':{t:len(r) for t,r in rows.items()}})+'\n')
        p=self.root/name;p.write_text(''.join(lines));return p
class MigrationTests(FixtureMixin, unittest.TestCase):
    def test_deterministic_schema_and_all_tables(self):
        sql,gaps=generate(self.cat);self.assertEqual(sql,m.SCHEMA.read_text());self.assertTrue(gaps)
        self.assertEqual(set(self.specs), {c['table_name'] for c in self.cat['columns']} | {'_auth_users'})
    def test_initial_copy_and_all_record_hashes(self):
        s=self.snapshot(self.seed());result=m.sync(s,self.target)
        self.assertEqual(set(result['validated']),set(self.specs));self.assertFalse(result['cutover_ready']);m.validate(s,self.target)
    def test_incremental_insert_update_delete_and_noop(self):
        s1=self.snapshot(self.seed());m.sync(s1,self.target)
        s2=self.snapshot(self.seed(2),'next.jsonl');b=self.root/'backup.sqlite';r=m.sync(s2,self.target,b)
        self.assertEqual(r['diff']['regions'],{'inserted':1,'updated':0,'deleted':1})
        self.assertEqual(r['diff']['users_profile']['updated'],1)
        r2=m.sync(s2,self.target,self.root/'second.sqlite');self.assertFalse(any(any(v.values()) for v in r2['diff'].values()))
        m.validate(s1,b);m.validate(s2,self.target)
    def test_restore_recovers_previous_snapshot(self):
        s1=self.snapshot(self.seed());m.sync(s1,self.target);b=self.root/'backup.sqlite'
        m.sync(self.snapshot(self.seed(2),'next.jsonl'),self.target,b)
        restored=self.root/'restored.sqlite';m.restore(b,restored);m.validate(s1,restored)
        with self.assertRaises(ValueError):m.restore(b,restored)
    def test_foreign_key_failure_rolls_back(self):
        s=self.snapshot(self.seed());m.sync(s,self.target);rows=self.seed(2);rows['_auth_users']={}
        with self.assertRaises(ValueError):m.sync(self.snapshot(rows,'bad.jsonl'),self.target,self.root/'backup.sqlite')
        m.validate(s,self.target)
    def test_corrupt_and_truncated_snapshots_rejected_before_write(self):
        s=self.snapshot(self.seed());s.write_text(s.read_text().replace('first@example.test','other@example.test'))
        with self.assertRaises(ValueError):m.sync(s,self.target)
        self.assertFalse(self.target.exists())
        s=self.snapshot(self.seed());s.write_text('\n'.join(s.read_text().splitlines()[:-1])+'\n')
        with self.assertRaises(ValueError):m.sync(s,self.target)
    def test_missing_table_and_schema_drift_rejected(self):
        rows=self.seed();del rows['regions'];s=self.snapshot(rows)
        with self.assertRaises(ValueError):m.sync(s,self.target)
        s=self.snapshot(self.seed());s.write_text(s.read_text().replace(m.digest(m.CATALOG.read_bytes()),'wrong'))
        with self.assertRaises(ValueError):m.sync(s,self.target)
    def test_backup_required_and_never_overwritten(self):
        s=self.snapshot(self.seed());m.sync(s,self.target)
        with self.assertRaises(ValueError):m.sync(s,self.target)
        b=self.root/'backup.sqlite';b.write_text('precious')
        with self.assertRaises(FileExistsError):m.sync(s,self.target,b)
        self.assertEqual(b.read_text(),'precious');m.validate(s,self.target)
    def test_tampered_target_detected(self):
        s=self.snapshot(self.seed());m.sync(s,self.target)
        with sqlite3.connect(self.target) as db:db.execute("UPDATE users_profile SET full_name='tampered'")
        with self.assertRaises(ValueError):m.validate(s,self.target)
    def test_scalar_precision_and_array_serialization(self):
        self.assertEqual(m.normalize('12345678901234567890.123456789','numeric'),'12345678901234567890.123456789')
        self.assertEqual(m.normalize(['a','b'],'_text'),'["a","b"]')
        exact=m.parse_json('{"amount":12345678901234567890.123456789}')
        self.assertEqual(m.normalize(exact,'jsonb'),'{"amount":12345678901234567890.123456789}')
        self.assertEqual(m.normalize({'b':2,'a':1},'jsonb'),'{"a":1,"b":2}')
        for value,typ in [(0.1,'numeric'),('true','bool'),(2**63,'int8'),('{}','_text')]:
            with self.assertRaises(ValueError):m.normalize(value,typ)
    def test_duplicate_and_unknown_columns_fail(self):
        s=self.snapshot(self.seed());s.write_text(s.read_text().replace('first@example.test','first@example.test\",\"unknown\":\"no'))
        with self.assertRaises(ValueError):m.sync(s,self.target)
        rows=self.seed();rows['users_profile']['duplicate']=next(iter(rows['users_profile'].values()))
        with self.assertRaises(ValueError):m.sync(self.snapshot(rows,'duplicate.jsonl'),self.target)
    def test_nullable_json_and_invalid_json(self):
        db=m.connect(':memory:');db.executescript(m.SCHEMA.read_text())
        db.execute("INSERT INTO audit_logs(id,action,metadata) VALUES ('a','test',NULL)")
        with self.assertRaises(sqlite3.IntegrityError):db.execute("INSERT INTO audit_logs(id,action,metadata) VALUES ('b','test','invalid')")
        db.close()
    def test_private_file_permissions(self):
        m.sync(self.snapshot(self.seed()),self.target)
        self.assertEqual(os.stat(self.target).st_mode & 0o777,0o600)

if __name__=='__main__':unittest.main()
