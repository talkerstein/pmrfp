"""Read-only public Supabase object backup, with pinned origin and private files.

Private-bucket objects are deliberately excluded. R2 upload and application
serving are separate steps; this module never changes source objects or access.
"""
import concurrent.futures,hashlib,json,os,re,urllib.parse,urllib.request
from pathlib import Path

ORIGIN='https://tumexryzbzmtijvbloch.supabase.co'
MAX_BYTES=100*1024*1024

def objects(manifest):
    buckets=manifest.get('buckets');rows=manifest.get('objects')
    if not isinstance(buckets,list) or not isinstance(rows,list) or len(rows)>1000:raise ValueError('Invalid bounded storage inventory')
    registry={b['id']:b for b in buckets}
    if len(registry)!=len(buckets) or any(type(b.get('public')) is not bool for b in buckets):raise ValueError('Invalid bucket inventory')
    seen=set();result=[]
    for row in rows:
        bucket=row.get('bucket_id');name=row.get('name');meta=row.get('metadata')
        if bucket not in registry or not re.fullmatch(r'[a-z0-9-]{3,63}',bucket) or not isinstance(name,str) or not name or '\x00' in name or any(p in ('','.','..') for p in name.split('/')) or not isinstance(meta,dict):raise ValueError('Invalid object identity')
        key=bucket+'/'+name
        if key in seen:raise ValueError('Duplicate object identity')
        seen.add(key)
        size=meta.get('size')
        if type(size) is not int or not 0<=size<=MAX_BYTES:raise ValueError('Unsupported object size')
        if not isinstance(meta.get('mimetype'),str) or not meta['mimetype']:raise ValueError('Missing source content type')
        result.append({'key':key,'public':registry[bucket]['public'],'size':size,'source':row,'file':hashlib.sha256(key.encode()).hexdigest()+'.bin'})
    if sum(x['size'] for x in result)>1024*1024*1024:raise ValueError('Storage copy exceeds bounded inventory')
    return result

def etag(value):return str(value or '').removeprefix('W/').strip('"')

def download_public(manifest,folder,opener=urllib.request.urlopen,workers=4):
    plan=objects(manifest);public=[x for x in plan if x['public']]
    folder=Path(folder);folder.mkdir(mode=0o700,parents=False,exist_ok=False)
    def download(item):
        row=item['source'];url=ORIGIN+'/storage/v1/object/public/'+urllib.parse.quote(item['key'],safe='/')
        req=urllib.request.Request(url,headers={'Accept-Encoding':'identity'})
        path=folder/item['file'];sha=hashlib.sha256();md5=hashlib.md5();size=0
        try:
            with opener(req,timeout=45) as response:
                if urllib.parse.urlsplit(response.geturl()).netloc!=urllib.parse.urlsplit(ORIGIN).netloc:raise ValueError('Unexpected storage redirect')
                source_etag=etag(row['metadata'].get('eTag'))
                if not source_etag or etag(response.headers.get('ETag'))!=source_etag:raise ValueError('Source object revision changed')
                content_type=response.headers.get('Content-Type','')
                if content_type.split(';')[0].strip().lower()!=row['metadata']['mimetype'].lower():raise ValueError('Source content type changed')
                fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                with os.fdopen(fd,'wb') as output:
                    while True:
                        chunk=response.read(1024*1024)
                        if not chunk:break
                        size+=len(chunk)
                        if size>item['size']:raise ValueError('Source object size changed')
                        sha.update(chunk);md5.update(chunk);output.write(chunk)
                if size!=item['size']:raise ValueError('Source object size changed')
                if re.fullmatch(r'[a-fA-F0-9]{32}',source_etag) and md5.hexdigest()!=source_etag.lower():raise ValueError('Source checksum differs')
                return {'key':item['key'],'file':item['file'],'bytes':size,'sha256':sha.hexdigest(),'etag':source_etag,'contentType':content_type,'cacheControl':response.headers.get('Cache-Control',''),'public':True}
        except BaseException:
            path.unlink(missing_ok=True);raise
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(workers,4))) as pool:copied=list(pool.map(download,public))
    report={'manifestSha256':hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'objects':copied,'privateObjectsSkipped':sum(not x['public'] for x in plan),'sourceWrites':0}
    fd=os.open(folder/'download-manifest.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as stream:json.dump(report,stream,indent=2)
    return {'publicObjectsDownloaded':len(copied),'bytes':sum(x['bytes'] for x in copied),'privateObjectsSkipped':report['privateObjectsSkipped'],'allFilesChecksummed':True,'sourceWrites':0}
