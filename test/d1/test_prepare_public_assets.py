import hashlib,io,json,tempfile,unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import test_migrate  # Adds the migration scripts directory for standalone discovery.

import prepare_public_assets as assets

class PublicAssetTests(unittest.TestCase):
    def setUp(self):
        folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup);self.root=Path(folder.name)
        self.data=b'test png';self.key='logos/example.png';self.output=self.root/'prepared.json'
        self.record=self.fixture(self.key)
    def fixture(self,key):
        identity=hashlib.sha256(key.encode()).hexdigest();filename=identity+'.bin'
        (self.root/filename).write_bytes(self.data)
        return {'key':key,'file':filename,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest(),'etag':'source-revision','contentType':'image/png','public':True}
    def manifest(self,row):
        (self.root/'download-manifest.json').write_text(json.dumps({'objects':[row]}))
    def opener(self,revision='source-revision'):
        def request(req,timeout):
            self.assertEqual(req.get_method(),'HEAD');self.assertIsNone(req.get_header('Authorization'));self.assertIsNone(req.get_header('Cookie'))
            response=io.BytesIO();response.status=200;response.headers=Message();response.headers['ETag']='"'+revision+'"';response.headers['Content-Length']=str(len(self.data));response.headers['Content-Type']='image/png'
            return response
        return SimpleNamespace(open=request)
    def test_only_currently_public_matching_backup_is_prepared(self):
        self.manifest(self.record)
        with patch.object(assets.urllib.request,'build_opener',return_value=self.opener()):report=assets.prepare(self.root,self.output)
        self.assertEqual(report['sourceBodyBytesRead'],0);self.assertEqual(report['previouslyPublicImagesChecked'],1)
        prepared=json.loads(self.output.read_text())[0];self.assertEqual(prepared['md5'],hashlib.md5(self.data).hexdigest());self.assertNotIn('key',prepared)
    def test_never_probes_or_prepares_private_or_tampered_objects(self):
        with patch.object(assets.urllib.request,'build_opener') as opener:
            for row in [self.fixture('project-photos-private/example.png'),{**self.record,'public':False},{**self.record,'sha256':'0'*64}]:
                self.manifest(row)
                with self.assertRaises(ValueError):assets.prepare(self.root,self.output)
            opener.assert_not_called()
        self.assertFalse(self.output.exists())
    def test_changed_source_revision_cannot_enter_preview(self):
        self.manifest(self.record)
        with patch.object(assets.urllib.request,'build_opener',return_value=self.opener('changed')):
            with self.assertRaises(ValueError):assets.prepare(self.root,self.output)
        self.assertFalse(self.output.exists())
