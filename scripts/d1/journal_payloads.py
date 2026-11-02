"""Bound transport for atomic journals on the pinned rehearsal databases only.

Private payload rows are staged separately; the final batch still applies every
guard and mutation atomically and drops the staging table in that transaction.
No application rows are modified by staging or abandoned-stage cleanup.
"""
import json,re
import migrate as m

TABLE='_migration_journal_payloads'
DDL='CREATE TABLE "_migration_journal_payloads" (id TEXT PRIMARY KEY, operation TEXT NOT NULL, payload TEXT NOT NULL)'
LIMIT=4_000_000

def operation_id(journal):
    return m.digest(m.canonical(journal).encode())

def cleanup(remote,operation):
    tables=remote.query("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",[TABLE])[0]['results']
    if not tables:return False
    # Never drop an unrecognized table, or another journal's staged payloads.
    if len(tables)!=1 or tables[0]['sql'].strip()!=DDL:
        raise ValueError('Unrecognized journal payload table; cleanup refused')
    rows=remote.query('SELECT DISTINCT operation FROM "'+TABLE+'"')[0]['results']
    if rows!=[{'operation':operation}]:raise ValueError('Unrecognized journal payload ownership; cleanup refused')
    remote.query('DROP TABLE "'+TABLE+'"')
    return True

def prepare(items,operation):
    if not isinstance(operation,str) or not re.fullmatch(r'[a-f0-9]{64}',operation):raise ValueError('Invalid journal operation identity')
    payloads={};rewritten=[]
    for item in items:
        sql=item['sql'];params=item.get('params',[])
        if 'json_each(?)' in sql:
            if len(params)!=1 or not isinstance(params[0],str):raise ValueError('Unexpected packed journal parameters')
            value=params[0]
            if len(value.encode())>90000:raise ValueError('Journal payload exceeds staging bound')
            key=m.digest(value.encode());payloads[key]=value
            sql=sql.replace('json_each(?)','json_each(COALESCE((SELECT payload FROM "'+TABLE+'" WHERE id=? AND operation=\''+operation+'\'),json(\'journal_payload_missing\')))')
            params=[key]
        rewritten.append({'sql':sql,'params':params})
    if not payloads:raise ValueError('No packed payloads to stage')
    # A metadata row makes even an interrupted initial staging transaction owned.
    rows=[{'sql':DDL,'params':[]},{'sql':'INSERT INTO "'+TABLE+'" VALUES (?,?,?)','params':['metadata',operation,'']}]
    uploads=[]
    for key,value in payloads.items():uploads.append({'sql':'INSERT INTO "'+TABLE+'" VALUES (?,?,?)','params':[key,operation,value]})
    # Never issue a large REST request while trying to recover from one.
    groups=[rows];group=[]
    for item in uploads:
        if group and (len(group)>=10 or len(json.dumps({'batch':group+[item]}).encode())>900000):
            groups.append(group);group=[]
        if len(json.dumps({'batch':[item]}).encode())>900000:raise ValueError('Encoded payload exceeds transport bound')
        group.append(item)
    if group:groups.append(group)
    # Removal belongs to the SAME transaction as all guards and mutations.
    rewritten.insert(-1,{'sql':'DROP TABLE "'+TABLE+'"','params':[]})
    if len(rewritten)>500:raise ValueError('Staged journal exceeds atomic statement bound')
    return groups,rewritten,payloads

def execute(remote,items,journal):
    if remote.name not in ('pmrfp-journal-canary-20261023','pmrfp-rebuilt-staging-20261029'):
        raise ValueError('Payload staging is restricted to pinned rehearsal databases')
    operation=operation_id(journal)
    groups,rewritten,expected=prepare(items,operation)
    try:
        for group in groups:remote.batch(group)
        # Verify the actual staged bytes before issuing the guarded atomic batch.
        keys=list(expected)
        for offset in range(0,len(keys),10):
            group=keys[offset:offset+10]
            actual=remote.query('SELECT id,payload FROM "'+TABLE+'" WHERE operation=? AND id IN ('+','.join('?' for _ in group)+')',[operation,*group])[0]['results']
            if {row['id']:row['payload'] for row in actual}!={key:expected[key] for key in group}:
                raise ValueError('Staged journal payload verification failed')
        remote.batch(rewritten)
    except BaseException:
        # Atomic rollback leaves only this journal's temporary metadata. An
        # uncertain committed response has already dropped the table. A failed
        # cleanup is intentionally visible and safely recoverable on retry.
        cleanup(remote,operation)
        raise
    return {'payloads':len(expected),'transport':'staged-private-payloads','atomicStatements':len(rewritten)}

def needed(items):
    return len(json.dumps({'batch':items}).encode())>LIMIT
