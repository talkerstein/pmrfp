import copy,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/d1'))
import migrate as m
import rebuild_snapshot as rebuild
import remote
from test_migrate import FixtureMixin

class RebuildTests(FixtureMixin,unittest.TestCase):
    def test_rebuilt_snapshot_roundtrip_preserves_all_authoritative_fields(self):
        snapshot=self.snapshot(self.seed());m.sync(snapshot,self.target)
        target=self.root/'rebuilt.sqlite';output=self.root/'rebuilt.jsonl'
        report=rebuild.build(snapshot,self.target,target,output,'2026-10-22T09:07:00Z')
        expected,_,_=m.read_snapshot(snapshot,self.cat);actual,meta,_=m.read_snapshot(output,self.cat)
        rebuild.check_preserved(expected,actual,json.loads((m.ROOT/'d1/rebuild-policy.json').read_text()))
        self.assertEqual(meta['source'],'approved-derived-rebuild');self.assertIn('parent_snapshot_sha256',meta)
        self.assertEqual(report['authoritative_fields'],'identical');m.validate(output,target);m.validate(snapshot,self.target)
        with self.assertRaises(FileExistsError):rebuild.build(snapshot,self.target,target,output,'2026-10-22T09:07:00Z')
    def test_unknown_tables_and_unlisted_fields_fail_closed(self):
        policy=json.loads((m.ROOT/'d1/rebuild-policy.json').read_text())
        source={'new_business_table':{'one':{'id':'one','value':'keep'}}}
        changed=copy.deepcopy(source);changed['new_business_table']['one']['value']='changed'
        with self.assertRaises(ValueError):rebuild.check_preserved(source,changed,policy)
        with self.assertRaises(ValueError):rebuild.check_preserved(source,{},policy)
        with self.assertRaises(ValueError):rebuild.check_preserved({'rate_limit_hits':{}},{'rate_limit_hits':{'unexpected':{}}},policy)
    def test_pinned_remote_generations_require_expected_database_identity(self):
        with patch.dict('os.environ',{'CLOUDFLARE_API_TOKEN':'synthetic-token'}):
            with patch.object(remote.Remote,'request',return_value={'result':{'name':remote.TARGETS['v3'][1]}}):
                target=remote.Remote(generation='v3');self.assertTrue(target.url.endswith(remote.TARGETS['v3'][0]))
            with patch.object(remote.Remote,'request',return_value={'result':{'name':'different-database'}}):
                with self.assertRaises(ValueError):remote.Remote(generation='v3')
            with self.assertRaises(ValueError):remote.Remote(generation='production')
