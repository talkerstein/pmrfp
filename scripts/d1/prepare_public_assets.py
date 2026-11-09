"""Prepare an owner-only public-image preview manifest from a verified backup.

Recheck unauthenticated Source visibility and object revisions with HEAD; no
Source downloads, customer-private objects, or storage writes in this step.
"""
import argparse,concurrent.futures,hashlib,json,os,re,stat,time,urllib.error,urllib.parse,urllib.request
from pathlib import Path
from storage_copy import ORIGIN,etag

BUCKETS={'logos','rfp-photos'}
TYPES={'image/png','image/jpeg','image/webp'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def prepare(folder,output):
    folder=Path(folder);info=folder.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_mode&0o077 or info.st_uid!=os.getuid():raise ValueError('Owner-only backup directory required')
    rows=json.loads((folder/'download-manifest.json').read_text())['objects']
    if not isinstance(rows,list) or not 1<=len(rows)<=1000:raise ValueError('Bounded backup manifest required')
    def check(item):
        key=item['key'];filename=item['file'];identity=hashlib.sha256(key.encode()).hexdigest()
        if item.get('public') is not True or key.split('/')[0] not in BUCKETS or len(key.split('/'))<2 or any(part in ('','.','..') for part in key.split('/')) or filename!=identity+'.bin':raise ValueError('Unapproved public image identity')
        mime=item['contentType'].split(';')[0].strip().lower()
        if mime not in TYPES or not re.fullmatch(r'[a-f0-9]{64}',item['sha256']):raise ValueError('Invalid media declaration')
        path=folder/filename;info=path.lstat()
        if not stat.S_ISREG(info.st_mode) or not 0<info.st_size<=100*1024*1024 or info.st_size!=item['bytes']:raise ValueError('Invalid backed up image size')
        data=path.read_bytes()
        if hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError('Public backup checksum mismatch')
        url=ORIGIN+'/storage/v1/object/public/'+urllib.parse.quote(key,safe='/')+'?migration_head='+str(time.time_ns())
        request=urllib.request.Request(url,method='HEAD',headers={'Accept-Encoding':'identity','Cache-Control':'no-cache'})
        try:
            with urllib.request.build_opener(NoRedirect).open(request,timeout=30) as response:
                if response.status!=200 or response.headers.get('Content-Length')!=str(info.st_size) or etag(response.headers.get('ETag'))!=item['etag'] or response.headers.get_content_type()!=mime:raise ValueError('Public Source object changed')
        except (OSError,urllib.error.URLError):raise ValueError('Public Source object could not be verified without credentials') from None
        return {'id':identity,'sha256':item['sha256'],'md5':hashlib.md5(data).hexdigest(),'type':mime,'bytes':info.st_size,'file':filename}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:assets=list(pool.map(check,rows))
    if len({a['id'] for a in assets})!=len(assets):raise ValueError('Duplicate public image')
    fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as stream:json.dump(assets,stream)
    return {'previouslyPublicImagesChecked':len(assets),'bytes':sum(a['bytes'] for a in assets),'sourceBodyBytesRead':0,'sourceWrites':0}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--backup',required=True);p.add_argument('--output',required=True);a=p.parse_args();print(json.dumps(prepare(a.backup,a.output)))
