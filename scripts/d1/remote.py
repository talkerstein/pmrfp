"""Private D1 staging rehearsal through the official query API.

Pinned to an explicit rehearsal database registry; cannot target production. No serving API is
created. A partial load stays marked 'loading' until every record and FK passes.
Use CLOUDFLARE_API_TOKEN, or explicitly opt into the local Wrangler OAuth file.
"""
import argparse,contextlib,graphlib,json,os,re,subprocess,time,urllib.request,urllib.error
from pathlib import Path
import migrate as m
ACCOUNT='f4e9b098134981b108024243b2a72ed4'
DATABASE='80b90607-2f8d-4f9b-a646-658f2ebad0bc'
NAME='pmrfp-migration-staging-v2-20261021'
TARGETS={'v2':(DATABASE,NAME),'v3':('ea67a920-f736-4eea-a66d-a1a64d45e2b0','pmrfp-migration-staging-v3-20261022'),'rebuilt-v1':('a6d834f8-b00e-410f-91e1-b695209212e1','pmrfp-rebuilt-staging-20261022'),'rebuilt-reader-v1':('08ef9af3-a400-4a73-92d3-702b6ff39662','pmrfp-rebuilt-reader-staging-20261022'),'rebuilt-20261023':('9c41192c-bd59-471e-8baa-a5675d7f2c47','pmrfp-rebuilt-staging-20261023')}

class Remote:
    def __init__(self,wrangler_auth=False,generation='v2'):
        if generation not in TARGETS:raise ValueError('Unknown rehearsal generation')
        database,self.name=TARGETS[generation]
        self.wrangler_auth=wrangler_auth and not os.environ.get('CLOUDFLARE_API_TOKEN')
        self.token=os.environ.get('CLOUDFLARE_API_TOKEN')
        if not self.token and wrangler_auth:
            auth=Path.home()/'Library/Preferences/.wrangler/config/default.toml'
            match=re.search(r'^oauth_token\s*=\s*"([^"]+)"',auth.read_text(),re.M)
            self.token=match[1] if match else None
        if not self.token:raise ValueError('Cloudflare authentication required')
        self.url=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{database}'
        info=self.request('GET','')
        if info['result']['name']!=self.name:raise ValueError('Staging target mismatch')
    def request(self,method,path,body=None):
        data=None if body is None else json.dumps(body).encode()
        for attempt in range(3):
            req=urllib.request.Request(self.url+path,data=data,method=method,headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(req,timeout=40) as r:response=json.load(r)
            except urllib.error.HTTPError as e:
                if e.code==401 and self.wrangler_auth and attempt==0:
                    # Refresh the existing approved session, without printing tokens
                    # or opening a new authorization flow.
                    refreshed=subprocess.run(['npx','--yes','wrangler@4','whoami'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
                    if refreshed.returncode:raise RuntimeError('Wrangler session refresh failed') from None
                    auth=Path.home()/'Library/Preferences/.wrangler/config/default.toml'
                    match=re.search(r'^oauth_token\s*=\s*"([^"]+)"',auth.read_text(),re.M)
                    if not match:raise RuntimeError('Wrangler session unavailable') from None
                    self.token=match[1];continue
                if e.code in [429,500,502,503,504] and attempt<2:time.sleep(2**attempt);continue
                # Do not echo the response body: SQL errors can include row data.
                raise RuntimeError(f'Cloudflare HTTP {e.code}') from None
            if not response.get('success'):raise RuntimeError('Cloudflare request failed (details suppressed to protect row data)')
            return response
        raise RuntimeError('Cloudflare request exhausted retries')
    def query(self,sql,params=None):
        r=self.request('POST','/query',{'sql':sql,'params':params or []})['result']
        if not all(x.get('success') for x in r):raise RuntimeError('D1 query failed')
        return r
    def batch(self,items):
        r=self.request('POST','/query',{'batch':items})['result']
        if not all(x.get('success') for x in r):raise RuntimeError('D1 batch failed')
        return r

def order_records(rows,catalog,specs):
    # Order actual rows, not tables: the forum has a schema-level cycle
    # (thread -> accepted post -> thread) even when those values are NULL.
    graph={(t,k):set() for t,records in rows.items() for k in records}
    for con in catalog['constraints']:
        if con['type']!='f':continue
        match=re.fullmatch(r'FOREIGN KEY \(([^)]+)\) REFERENCES ([^(]+)\(([^)]+)\)(.*)',con['definition'])
        if not match:raise ValueError('Unparsed foreign key')
        child=con['table_name'];parent=match[2].replace('auth.users','_auth_users').replace('public.','')
        childcols=[x.strip().strip('"') for x in match[1].split(',')]
        parentcols=[x.strip().strip('"') for x in match[3].split(',')]
        parents={m.canonical([row[k] for k in parentcols]):key for key,row in rows[parent].items()}
        for key,row in rows[child].items():
            values=[row[k] for k in childcols]
            if any(v is None for v in values):continue
            parentkey=parents.get(m.canonical(values))
            if parentkey is None:raise ValueError('Unresolved foreign key')
            if (child,key)!=(parent,parentkey):graph[(child,key)].add((parent,parentkey))
    return [(table,rows[table][key]) for table,key in graphlib.TopologicalSorter(graph).static_order()]

def manifest(remote):
    return remote.query('SELECT source_sha256,state FROM _migration_manifest WHERE id=1')[0]['results']

def load(remote,snapshot):
    catalog=m.load_catalog();specs=m.table_specs(catalog);rows,_,sha=m.read_snapshot(snapshot,catalog)
    ordered=order_records(rows,catalog,specs) # Detect cycles before touching remote.
    if any(isinstance(v,int) and abs(v)>2**53-1 for _,row in ordered for v in row.values()):
        raise ValueError('D1 JSON API cannot safely represent this integer; explicit text mapping required')
    remote.query('CREATE TABLE IF NOT EXISTS _migration_manifest (id INTEGER PRIMARY KEY CHECK(id=1),source_sha256 TEXT NOT NULL,state TEXT NOT NULL)')
    existing=manifest(remote)
    if existing and existing[0]['source_sha256']!=sha:raise ValueError('Staging already contains a different snapshot; create a new rehearsal database')
    if not existing:
        names=remote.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' AND name <> '_migration_manifest'")[0]['results']
        if names:raise ValueError('Refusing to load an unrecognized nonempty target')
        remote.query("INSERT INTO _migration_manifest VALUES (1,?,'loading')",[sha])
    remote.query("UPDATE _migration_manifest SET state='loading' WHERE id=1 AND source_sha256=?",[sha])
    # CREATE IF NOT EXISTS permits resuming an interrupted staging load.
    schema=m.SCHEMA.read_text().replace('PRAGMA foreign_keys=ON;','').replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS ').replace('CREATE UNIQUE INDEX ','CREATE UNIQUE INDEX IF NOT EXISTS ').replace('CREATE INDEX ','CREATE INDEX IF NOT EXISTS ')
    remote.query(schema)
    batch=[];done=0
    for table,row in ordered:
        spec=specs[table];cols=[c['column_name'] for c in spec['columns'] if c['is_generated']=='NEVER']
        batch.append({'sql':'INSERT INTO '+m.ident(table)+' ('+','.join(map(m.ident,cols))+') VALUES ('+','.join('?' for _ in cols)+') ON CONFLICT ('+','.join(map(m.ident,spec['pk']))+') DO NOTHING','params':[row[c] for c in cols]})
        if len(batch)==50:
            remote.batch(batch);done+=len(batch);batch=[]
            if done%1000==0:print(json.dumps({'loaded':done}),flush=True)
    if batch:remote.batch(batch);done+=len(batch)
    return finalize(remote,snapshot)

def verify(remote,snapshot,require_validated=True,backup_path=None):
    catalog=m.load_catalog();specs=m.table_specs(catalog);expected,_,sha=m.read_snapshot(snapshot,catalog)
    before=manifest(remote)
    if not before or before[0]['source_sha256']!=sha:raise ValueError('Remote source mismatch')
    if require_validated and before[0]['state']!='validated':raise ValueError('Remote copy is incomplete')
    with contextlib.closing(m.connect(':memory:')) as db:
        db.executescript(m.SCHEMA.read_text())
        expected_schema={r['name']:r['sql'] for r in db.execute("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index')")}
    remote_schema={r['name']:r['sql'] for r in remote.query("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index')")[0]['results'] if r['name'] not in ['_cf_KV','_migration_manifest']}
    def normalized_sql(sql):return re.sub(r'\s+',' ',re.sub(r'\bIF NOT EXISTS\s*','',sql,flags=re.I)).strip().rstrip(';')
    if set(remote_schema)!=set(expected_schema) or any(normalized_sql(remote_schema[k])!=normalized_sql(v) for k,v in expected_schema.items()):raise ValueError('Remote candidate schema mismatch')
    actual={t:{} for t in specs}
    for table,spec in specs.items():
        offset=0
        while True:
            page=remote.query('SELECT * FROM '+m.ident(table)+' ORDER BY '+','.join(map(m.ident,spec['pk']))+' LIMIT 250 OFFSET ?',[offset])[0]['results']
            for row in page:actual[table][m.canonical([row[k] for k in spec['pk']])]=row
            if len(page)<250:break
            offset+=len(page)
    diffs=m.compare(expected,actual)
    if any(any(v.values()) for v in diffs.values()):raise ValueError('Remote record comparison failed')
    if remote.query('PRAGMA foreign_key_check')[0]['results']:raise ValueError('Remote foreign key violations')
    if remote.query('PRAGMA quick_check')[0]['results'][0]['quick_check']!='ok':raise ValueError('Remote integrity check failed')
    if manifest(remote)!=before:raise ValueError('Remote manifest changed during verification')
    if backup_path:
        # Build the backup from rows actually read back from D1, not source rows.
        with contextlib.closing(m.connect(':memory:')) as db:
            db.executescript(m.SCHEMA.read_text());db.execute('BEGIN');db.execute('PRAGMA defer_foreign_keys=ON')
            for table,spec in specs.items():
                cols=[c['column_name'] for c in spec['columns'] if c['is_generated']=='NEVER']
                sql='INSERT INTO '+m.ident(table)+' ('+','.join(map(m.ident,cols))+') VALUES ('+','.join('?' for _ in cols)+')'
                for row in actual[table].values():db.execute(sql,[row[c] for c in cols])
            m.check(db,expected,specs);db.commit();m.backup(db,backup_path)
    return {'database':getattr(remote,'name',NAME),'source_sha256':sha,'tables':len(specs),'records':sum(len(v) for v in expected.values()),'schema_sha256':m.digest(m.SCHEMA.read_bytes()),'schema_comparison':'identical','record_comparison':'all fields identical','foreign_keys':'valid','cutover_ready':False}

def finalize(remote,snapshot,backup_path=None):
    result=verify(remote,snapshot,require_validated=False,backup_path=backup_path)
    remote.query("UPDATE _migration_manifest SET state='validated' WHERE id=1 AND source_sha256=?",[result['source_sha256']])
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['load','verify','finalize']);p.add_argument('--snapshot',required=True);p.add_argument('--generation',choices=sorted(TARGETS),default='v2');p.add_argument('--wrangler-auth',action='store_true');p.add_argument('--report',required=True);p.add_argument('--backup');a=p.parse_args()
    remote=Remote(a.wrangler_auth,a.generation);result=load(remote,a.snapshot) if a.command=='load' else (finalize(remote,a.snapshot,backup_path=a.backup) if a.command=='finalize' else verify(remote,a.snapshot,backup_path=a.backup))
    fd=os.open(a.report,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,indent=2)
    print(json.dumps(result))
