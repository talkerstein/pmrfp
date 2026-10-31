"""Offline staging rehearsal. Production serving and remote writes are intentionally absent.

Snapshots are complete, consistent PostgreSQL exports. Comparing full snapshots
finds deletes and updates even on tables without updated_at. This is incremental
application, not low-egress CDC. Each import validates all records and FKs before
committing, and backs up an existing target before touching it.
"""
import argparse, contextlib, hashlib, json, os, re, sqlite3, subprocess, tempfile
from decimal import Decimal
from pathlib import Path
from schema import ROOT, ident

CATALOG=Path(os.environ.get('D1_MIGRATION_CATALOG',str(ROOT/'d1/postgres-catalog.json')))
SCHEMA=Path(os.environ.get('D1_MIGRATION_SCHEMA',str(ROOT/'d1/0001-staging-copy.sql')))

def canonical(v):
    # Preserve arbitrary-precision numbers inside JSONB as JSON numbers.
    if isinstance(v,Decimal):
        if not v.is_finite():raise ValueError('Non-finite JSON number')
        return str(v)
    if isinstance(v,dict):
        if not all(isinstance(k,str) for k in v):raise ValueError('JSON keys must be strings')
        return '{'+','.join(canonical(k)+':'+canonical(v[k]) for k in sorted(v))+'}'
    if isinstance(v,(list,tuple)):return '['+','.join(canonical(x) for x in v)+']'
    return json.dumps(v,ensure_ascii=False,allow_nan=False)
def parse_json(text):return json.loads(text,parse_float=Decimal)
def digest(v):return hashlib.sha256(v).hexdigest()
def load_catalog():return json.loads(CATALOG.read_text())
def table_specs(catalog):
    result={}
    for c in catalog['columns']:result.setdefault(c['table_name'],{'columns':[]})['columns'].append(c)
    for con in catalog['constraints']:
        if con['type']=='p':result[con['table_name']]['pk']=[x.strip().strip('"') for x in re.search(r'\(([^)]+)\)',con['definition'])[1].split(',')]
    for name,spec in result.items():
        if not spec.get('pk'):raise ValueError(f'Table without primary key: {name}')
    result['_auth_users']={'columns':[{'column_name':'id','udt_name':'uuid','is_generated':'NEVER'}], 'pk':['id']}
    return result

def normalize(value, typ):
    if value is None:return None
    if typ=='bool':
        if type(value) is not bool:raise ValueError('Expected boolean')
        return int(value)
    if typ.startswith('_') or typ=='jsonb':
        if typ.startswith('_') and not isinstance(value,list):raise ValueError('Expected array')
        return canonical(value)
    if typ in ['int2','int4','int8']:
        if type(value) is not int or not -(2**63)<=value<2**63:raise ValueError('Invalid SQLite integer')
        return value
    if typ=='numeric':
        # PostgreSQL exporter emits numerics as text, avoiding JSON float loss.
        if not isinstance(value,str):raise ValueError('Numeric must be exported as decimal text')
        if not Decimal(value).is_finite():raise ValueError('Invalid decimal')
        return value
    if not isinstance(value,str):raise ValueError(f'Expected text for {typ}')
    return value

def read_snapshot(path,catalog):
    specs=table_specs(catalog); rows={t:{} for t in specs}; meta=None; footer=None
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for line in f:
            record=parse_json(line)
            if record.get('kind')=='footer':
                if footer is not None:raise ValueError('Duplicate footer')
                footer=record;continue
            if footer is not None:raise ValueError('Data after footer')
            h.update(line)
            if record.get('kind')=='meta':
                if meta is not None:raise ValueError('Duplicate metadata')
                meta=record;continue
            if meta is None:raise ValueError('Metadata must precede rows')
            name=record['table']; row=record['row']; spec=specs[name]
            cols=spec['columns']; expected={c['column_name'] for c in cols}
            if set(row)!=expected:raise ValueError(f'Column mismatch: {name}')
            normalized={c['column_name']:normalize(row[c['column_name']],c['udt_name']) for c in cols}
            key=canonical([normalized[k] for k in spec['pk']])
            if any(normalized[k] is None for k in spec['pk']) or key in rows[name]:raise ValueError(f'Duplicate/null key: {name}')
            rows[name][key]=normalized
    if not meta or meta.get('catalog_sha256')!=digest(CATALOG.read_bytes()):raise ValueError('Missing or incompatible catalog')
    if not footer or footer.get('sha256')!=h.hexdigest():raise ValueError('Incomplete or corrupted snapshot')
    counts={t:len(r) for t,r in rows.items()}
    if footer.get('counts')!=counts:raise ValueError('Missing table or inconsistent row count')
    if sorted(meta.get('tables',[]))!=sorted(specs):raise ValueError('Incomplete table coverage')
    return rows,meta,h.hexdigest()

def read_target(db,specs):
    out={}
    for t,spec in specs.items():
        out[t]={}
        for raw in db.execute('SELECT * FROM '+ident(t)):
            row=dict(raw);key=canonical([row[k] for k in spec['pk']]);out[t][key]=row
    return out

def compare(expected,actual):
    result={}
    for t in expected:
        e,a=expected[t],actual[t]
        result[t]={'inserted':len(e.keys()-a.keys()),'deleted':len(a.keys()-e.keys()),'updated':sum(e[k]!=a[k] for k in e.keys()&a.keys())}
    return result

def check(db,expected,specs):
    if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('SQLite integrity check failed')
    bad=db.execute('PRAGMA foreign_key_check').fetchall()
    if bad:raise ValueError(f'Foreign key violations: {len(bad)}')
    actual=read_target(db,specs)
    if any(any(v.values()) for v in compare(expected,actual).values()):raise ValueError('Record/relationship validation failed')
    return {t:{'rows':len(expected[t]),'sha256':digest(canonical(sorted(expected[t].items())).encode())} for t in specs}

def connect(path):
    db=sqlite3.connect(path,uri=True);db.row_factory=sqlite3.Row;db.execute('PRAGMA foreign_keys=ON');return db

def backup(db,path):
    # SQLite online backup is consistent even with WAL; never copy only the main file.
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    target=sqlite3.connect(path)
    try:db.backup(target)
    finally:target.close()

def sync(snapshot,target,backup_path=None):
    catalog=load_catalog();specs=table_specs(catalog);expected,meta,snapshot_hash=read_snapshot(snapshot,catalog)
    existed=Path(target).exists()
    if existed and not backup_path:raise ValueError('An existing target requires --backup')
    if not existed:
        fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    db=connect(target)
    try:
        if existed:backup(db,backup_path)
        else:db.executescript(SCHEMA.read_text())
        actual=read_target(db,specs);diff=compare(expected,actual)
        db.execute('BEGIN IMMEDIATE');db.execute('PRAGMA defer_foreign_keys=ON')
        # Delete only absent keys. No REPLACE: it can cascade-delete related rows.
        for t,spec in specs.items():
            for key in actual[t].keys()-expected[t].keys():
                db.execute('DELETE FROM '+ident(t)+' WHERE '+' AND '.join(ident(k)+'=?' for k in spec['pk']),json.loads(key))
        # Re-read after cascades, so rows reparented in the source are restored.
        after_deletes=read_target(db,specs)
        for t,spec in specs.items():
            writable=[c['column_name'] for c in spec['columns'] if c.get('is_generated','NEVER')=='NEVER']
            updates=[k for k in writable if k not in spec['pk']]
            sql='INSERT INTO '+ident(t)+' ('+','.join(map(ident,writable))+') VALUES ('+','.join('?' for _ in writable)+') ON CONFLICT ('+','.join(map(ident,spec['pk']))+') '+('DO UPDATE SET '+','.join(ident(k)+'=excluded.'+ident(k) for k in updates) if updates else 'DO NOTHING')
            for key,row in expected[t].items():
                if after_deletes[t].get(key)!=row:db.execute(sql,[row[k] for k in writable])
        validation=check(db,expected,specs)
        db.commit()
        return {'source':meta.get('source'),'snapshot_sha256':snapshot_hash,'diff':diff,'validated':validation,'backup':str(backup_path) if backup_path else None,'cutover_ready':False}
    except BaseException:
        db.rollback();raise
    finally:db.close()

def validate(snapshot,target):
    catalog=load_catalog();expected,_,_=read_snapshot(snapshot,catalog)
    with contextlib.closing(connect(target)) as db:return check(db,expected,table_specs(catalog))

def restore(source,target):
    if Path(target).exists():raise ValueError('Restore requires a new target path; validate before switching')
    with contextlib.closing(connect('file:'+str(Path(source).resolve())+'?mode=ro')) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Invalid backup')
        backup(db,target)

def capture_metadata_sql(meta):
    return "("+"'"+canonical(meta).replace("'","''")+"'::jsonb || jsonb_build_object('change_capture',jsonb_build_object('protocol',1,'bootstrap',true,'ids',(SELECT COALESCE(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM d1_migration.outbox WHERE acknowledged_at IS NULL))))::text"

def export_snapshot(output,capture_outbox=False):
    """Read-only PostgreSQL snapshot, numeric text, auth IDs only. No credentials in argv."""
    catalog=load_catalog();specs=table_specs(catalog)
    if not (os.environ.get('PGHOST') or os.environ.get('PGSERVICE')):raise ValueError('Set PGHOST, PGDATABASE, PGUSER and PGPASSWORD (or PGSERVICE) securely')
    out=Path(output)
    if out.exists():raise ValueError('Refusing to overwrite an existing snapshot')
    sql=['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', "SET LOCAL timezone='UTC';", "SET LOCAL statement_timeout='10min';"]
    meta={'kind':'meta','source':'postgres-repeatable-read','catalog_sha256':digest(CATALOG.read_bytes()),'tables':sorted(specs)}
    public_tables=sorted(t for t in specs if t!='_auth_users')
    table_guard="(SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public')"
    sql.append("SELECT 1 / CASE WHEN "+table_guard+" = '"+canonical(public_tables).replace("'","''")+"'::jsonb THEN 1 ELSE 0 END AS table_guard \\g /dev/null")
    if capture_outbox:
        sql.append("SELECT 1 / CASE WHEN (SELECT obj_description(oid,'pg_namespace') FROM pg_namespace WHERE nspname='d1_migration')='pmrfp-d1-change-capture-v1; reviewed 2026-10-31' AND (SELECT count(*) FROM d1_migration.outbox WHERE acknowledged_at IS NULL)<=75000 THEN 1 ELSE 0 END AS capture_guard \\g /dev/null")
        sql.append('SELECT '+capture_metadata_sql(meta)+';')
    else:sql.append('SELECT '+"'"+canonical(meta).replace("'","''")+"'::text;")
    # Abort on column/type/generated-column drift before exporting any rows.
    for table,spec in specs.items():
        if table=='_auth_users':
            relation=os.environ.get('D1_MIGRATION_AUTH_IDS_VIEW','auth.users')
            if relation not in ('auth.users','public.d1_migration_auth_ids_20261022'):raise ValueError('Unreviewed auth ID relation')
            projection='id';sourcecols=['id']
        else:
            relation='public.'+ident(table);sourcecols=[c['column_name'] for c in spec['columns']]
            projection=','.join(ident(c['column_name'])+('::text AS '+ident(c['column_name']) if c['udt_name']=='numeric' else '') for c in spec['columns'])
            expected=[{'column_name':c['column_name'],'udt_name':c['udt_name'],'is_generated':c['is_generated']} for c in spec['columns']]
            expr="(SELECT jsonb_agg(jsonb_build_object('column_name',column_name,'udt_name',udt_name,'is_generated',is_generated) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='"+table+"')"
            # A division by zero aborts the read-only transaction on drift.
            sql.append("SELECT 1 / CASE WHEN "+expr+" = '"+canonical(expected).replace("'","''")+"'::jsonb THEN 1 ELSE 0 END AS schema_guard \\g /dev/null")
        sql.append("SELECT json_build_object('table', '"+table+"', 'row', row_to_json(r))::text FROM (SELECT "+projection+' FROM '+relation+' ORDER BY '+','.join(map(ident,spec['pk']))+") r;")
    sql+=['COMMIT;']
    # psql stdout goes to a private temporary file; diagnostics are not echoed
    # because connection error messages can include sensitive connection data.
    fd,tmp=tempfile.mkstemp(prefix='.d1-snapshot-',dir=out.parent);os.close(fd)
    try:
        with open(tmp,'wb') as f:
            result=subprocess.run(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],input='\n'.join(sql).encode(),stdout=f,stderr=subprocess.PIPE)
        if result.returncode:raise RuntimeError('PostgreSQL export failed; verify connectivity, grants, and catalog drift privately')
        h=hashlib.sha256();counts={t:0 for t in specs}
        with open(tmp,'rb') as f:
            for line in f:
                h.update(line);r=json.loads(line)
                if 'table' in r:counts[r['table']]+=1
        with open(tmp,'ab') as f:f.write((canonical({'kind':'footer','sha256':h.hexdigest(),'counts':counts})+'\n').encode())
        read_snapshot(tmp,catalog)
        os.link(tmp,out)
        return {'tables':len(specs),'rows':sum(counts.values()),'sha256':h.hexdigest()}
    finally:Path(tmp).unlink(missing_ok=True)

def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    e=sub.add_parser('export');e.add_argument('--output',required=True);e.add_argument('--capture-outbox',action='store_true')
    for name in ['sync','validate']:
        q=sub.add_parser(name);q.add_argument('--snapshot',required=True);q.add_argument('--target',required=True)
        if name=='sync':q.add_argument('--backup')
    r=sub.add_parser('restore');r.add_argument('--backup',required=True);r.add_argument('--target',required=True)
    args=p.parse_args()
    if args.command=='export':result=export_snapshot(args.output,args.capture_outbox)
    elif args.command=='sync':result=sync(args.snapshot,args.target,args.backup)
    elif args.command=='validate':result=validate(args.snapshot,args.target)
    else:restore(args.backup,args.target);result={'restored':True}
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()
