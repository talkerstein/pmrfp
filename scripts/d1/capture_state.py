"""Durable D1 consumer checkpoint, tied to the retained source ACK receipt set.

Source receipt-set comparison detects a restored/rewound consumer checkpoint.
This is migration metadata only; it never authorizes application reads/writes.
"""
import json,re,subprocess
import migrate as m

TABLE='_migration_capture_state'
DDL='CREATE TABLE "_migration_capture_state" (id INTEGER PRIMARY KEY CHECK(id=1), protocol INTEGER NOT NULL CHECK(protocol=1), source_sha256 TEXT NOT NULL, candidate_sha256 TEXT NOT NULL, catalog_sha256 TEXT NOT NULL, receipt_digest TEXT NOT NULL)'
FIELDS=['id','protocol','source_sha256','candidate_sha256','catalog_sha256','receipt_digest']
DIGEST_EXPRESSION="encode(sha256(convert_to(COALESCE(string_agg(id::text||':'||destination_sha256,',' ORDER BY id),''),'UTF8')),'hex')"
DIGEST_SQL="""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog,public;
SELECT json_build_object('receiptDigest',__DIGEST__,'acknowledgedReceipts',count(*)::integer)
FROM d1_migration.outbox WHERE acknowledged_at IS NOT NULL;
COMMIT;
""".replace('__DIGEST__',DIGEST_EXPRESSION)

def validate(row):
    if not isinstance(row,dict) or set(row)!=set(FIELDS) or row['id']!=1 or row['protocol']!=1 or any(not isinstance(row[k],str) or not re.fullmatch(r'[a-f0-9]{64}',row[k]) for k in FIELDS[2:5]) or not isinstance(row['receipt_digest'],str) or not re.fullmatch(r'[a-f0-9]{64}',row['receipt_digest']):
        raise ValueError('Invalid durable capture checkpoint')
    if row['catalog_sha256']!=m.digest(m.CATALOG.read_bytes()):raise ValueError('Capture checkpoint catalog mismatch')
    return row

def schema_ok(sql):
    normalize=lambda s:re.sub(r'\s+',' ',re.sub(r'\bIF NOT EXISTS\s*','',s,flags=re.I)).strip().rstrip(';')
    return isinstance(sql,str) and normalize(sql)==normalize(DDL)

def read(remote):
    found=remote.query("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",[TABLE])[0]['results']
    if not found:return None
    if len(found)!=1 or not schema_ok(found[0]['sql']):raise ValueError('Unrecognized capture metadata schema')
    rows=remote.query('SELECT * FROM "'+TABLE+'"')[0]['results']
    if len(rows)!=1:raise ValueError('Incomplete durable capture checkpoint')
    return validate(rows[0])

def source_digest(runner=subprocess.run,exclude_ids=None,dataset=None):
    sql=DIGEST_SQL
    if exclude_ids:
        if len(exclude_ids)>75000 or not isinstance(dataset,str) or not re.fullmatch(r'[a-f0-9]{64}',dataset) or any(not isinstance(i,str) or not re.fullmatch(r'[1-9][0-9]{0,18}',i) or int(i)>2**63-1 for i in exclude_ids):raise ValueError('Invalid receipt exclusion')
        sql=sql.replace('acknowledged_at IS NOT NULL;',"acknowledged_at IS NOT NULL AND NOT(id=ANY(ARRAY["+','.join(exclude_ids)+"]::bigint[]) AND destination_sha256='"+dataset+"');")
    result=runner(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],input=sql.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    if result.returncode:raise RuntimeError('Source receipt digest read failed; diagnostics suppressed')
    try:d=json.loads(result.stdout)
    except (ValueError,TypeError):raise ValueError('Invalid source receipt digest') from None
    if not isinstance(d,dict) or set(d)!={'receiptDigest','acknowledgedReceipts'} or not isinstance(d['receiptDigest'],str) or not re.fullmatch(r'[a-f0-9]{64}',d['receiptDigest']) or type(d['acknowledgedReceipts']) is not int or not 0<=d['acknowledgedReceipts']<=750000:
        raise ValueError('Invalid or oversized source acknowledgement history')
    return d

def write(remote,source_sha,candidate_sha,receipt_digest):
    if remote.name not in ('pmrfp-rebuilt-staging-20261029','pmrfp-journal-canary-20261023'):raise ValueError('Capture metadata requires a pinned rehearsal database')
    row=validate(dict(zip(FIELDS,[1,1,source_sha,candidate_sha,m.digest(m.CATALOG.read_bytes()),receipt_digest])))
    existing=read(remote)
    batch=[{'sql':"SELECT CASE WHEN (SELECT source_sha256=? AND state='validated' FROM _migration_manifest WHERE id=1) THEN 1 ELSE json('capture_checkpoint_mismatch') END",'params':[candidate_sha]}]
    if existing is None:batch.append({'sql':DDL,'params':[]})
    batch.append({'sql':'INSERT INTO "'+TABLE+'" ('+','.join(FIELDS)+') VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET '+','.join(k+'=excluded.'+k for k in FIELDS[1:]),'params':[row[k] for k in FIELDS]})
    remote.batch(batch)
    if read(remote)!=row:raise ValueError('Durable capture checkpoint readback failed')
    return row
