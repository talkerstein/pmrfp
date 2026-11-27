import copy,hashlib,io,tempfile,unittest
from pathlib import Path
import storage_copy as s

class Response(io.BytesIO):
    def __init__(self,body,url,etag=None,content_type='image/png'):
        super().__init__(body);self.url=url;self.headers={'ETag':etag or hashlib.md5(body).hexdigest(),'Content-Type':content_type,'Cache-Control':'public,max-age=3600'}
    def geturl(self):return self.url

class StorageTests(unittest.TestCase):
    def manifest(self):
        body=b'synthetic image bytes'
        row={'id':'fixture','bucket_id':'logos','name':'folder/a space+unicode-é.png','metadata':{'size':len(body),'mimetype':'image/png','eTag':hashlib.md5(body).hexdigest()}}
        private=copy.deepcopy(row);private.update(id='private',bucket_id='project-photos-private')
        return {'buckets':[{'id':'logos','public':True},{'id':'project-photos-private','public':False}],'objects':[row,private]},body
    def test_public_only_download_checksums_and_private_permissions(self):
        manifest,body=self.manifest();requests=[]
        def opener(req,timeout):requests.append(req.full_url);return Response(body,req.full_url)
        with tempfile.TemporaryDirectory() as root:
            folder=Path(root)/'backup';result=s.download_public(manifest,folder,opener)
            self.assertEqual(result['publicObjectsDownloaded'],1);self.assertEqual(result['privateObjectsSkipped'],1)
            self.assertEqual(folder.stat().st_mode&0o777,0o700)
            file=next(folder.glob('*.bin'));self.assertEqual(file.read_bytes(),body);self.assertEqual(file.stat().st_mode&0o777,0o600)
            self.assertEqual(len(requests),1);self.assertIn('a%20space%2Bunicode-%C3%A9.png',requests[0]);self.assertNotIn('private',requests[0])
    def test_changed_etag_size_content_type_or_redirect_refuses_copy(self):
        manifest,body=self.manifest()
        for response in [lambda url:Response(body,url,etag='changed'),lambda url:Response(body+b'X',url,etag=hashlib.md5(body).hexdigest()),lambda url:Response(body,url,content_type='text/html'),lambda url:Response(body,'https://untrusted.invalid/file')]:
            with self.subTest(response=response),tempfile.TemporaryDirectory() as root:
                folder=Path(root)/'backup'
                with self.assertRaises(ValueError):s.download_public(manifest,folder,lambda req,timeout:response(req.full_url))
                self.assertEqual(list(folder.glob('*.bin')),[]);self.assertFalse((folder/'download-manifest.json').exists())
    def test_tampered_body_with_matching_size_and_header_is_rejected(self):
        manifest,body=self.manifest();wrong=b'x'*len(body)
        with tempfile.TemporaryDirectory() as root,self.assertRaisesRegex(ValueError,'checksum'):
            s.download_public(manifest,Path(root)/'backup',lambda req,timeout:Response(wrong,req.full_url,etag=hashlib.md5(body).hexdigest()))
    def test_invalid_unknown_duplicate_or_oversized_paths_are_rejected(self):
        manifest,_=self.manifest()
        for key,value in [('name','../escape'),('name','/escape'),('bucket_id','unknown'),('name','null\x00name')]:
            altered=copy.deepcopy(manifest);altered['objects'][0][key]=value
            with self.assertRaises(ValueError):s.objects(altered)
        altered=copy.deepcopy(manifest);altered['objects'].append(altered['objects'][0])
        with self.assertRaisesRegex(ValueError,'Duplicate'):s.objects(altered)
        altered=copy.deepcopy(manifest);altered['objects'][0]['metadata']['size']=s.MAX_BYTES+1
        with self.assertRaisesRegex(ValueError,'size'):s.objects(altered)
    def test_existing_backup_directory_is_never_overwritten(self):
        manifest,_=self.manifest()
        with tempfile.TemporaryDirectory() as root,self.assertRaises(FileExistsError):s.download_public(manifest,root)
