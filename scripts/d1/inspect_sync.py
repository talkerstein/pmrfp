"""Read aggregate Source backlog and pinned D1 checkpoint health, without writes."""
import argparse,datetime,json,re,subprocess
import acknowledge_capture as ack
import capture_state
from change_capture import role_guard
from consume_incremental import GENERATION,TARGET
import remote as r

PENDING_LIMIT=75000

def source_time(value):
    if not isinstance(value,str):raise ValueError('Invalid Source time')
    match=re.fullmatch(r'(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)',value)
    if not match:raise ValueError('Source time must include an offset')
    base,fraction,offset=match.groups()
    return datetime.datetime.fromisoformat(base+'.'+(fraction or '').ljust(6,'0')+('+00:00' if offset=='Z' else offset))

def source_health(runner=subprocess.run):
    ack.check_source_environment()
    sql=f'''BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL timezone='UTC';
SET LOCAL search_path=pg_catalog,public;
SELECT 1 / CASE WHEN ({role_guard()}) THEN 1 ELSE 0 END \\g /dev/null
SELECT json_build_object(
 'pendingReceipts',count(*) FILTER (WHERE acknowledged_at IS NULL),
 'oldestPendingAt',min(created_at) FILTER (WHERE acknowledged_at IS NULL),
 'latestAcknowledgedAt',max(acknowledged_at),
 'readerExpires',(SELECT rolvaliduntil FROM pg_roles WHERE rolname=current_user),
 'receiptDigest',(SELECT {capture_state.DIGEST_EXPRESSION} FROM d1_migration.outbox WHERE acknowledged_at IS NOT NULL),
 'acknowledgedReceipts',count(*) FILTER (WHERE acknowledged_at IS NOT NULL)) FROM d1_migration.outbox;
COMMIT;
'''
    result=runner(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],input=sql.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    if result.returncode:raise RuntimeError('Read-only Source health query failed; diagnostics suppressed')
    row=json.loads(result.stdout)
    if not isinstance(row,dict) or set(row)!={'pendingReceipts','oldestPendingAt','latestAcknowledgedAt','readerExpires','receiptDigest','acknowledgedReceipts'}:raise ValueError('Invalid Source health shape')
    if any(type(row[k]) is not int or row[k]<0 for k in ['pendingReceipts','acknowledgedReceipts']) or not isinstance(row['receiptDigest'],str) or not re.fullmatch(r'[a-f0-9]{64}',row['receiptDigest']):raise ValueError('Invalid Source health counters')
    source_time(row['readerExpires'])
    for key in ['oldestPendingAt','latestAcknowledgedAt']:
        if row[key] is not None:source_time(row[key])
    return row

def inspect(remote,runner=subprocess.run):
    if remote.name!=TARGET:raise ValueError('Only the current copied preview is allowed')
    before=(r.manifest(remote),capture_state.read(remote))
    source=source_health(runner)
    after=(r.manifest(remote),capture_state.read(remote))
    manifest,state=after
    if after!=before:reason='checkpoint_changed_during_check'
    elif not state or manifest!=[{'source_sha256':state['candidate_sha256'],'state':'validated'}]:reason='native_replay_or_checkpoint_incomplete'
    elif state['receipt_digest']!=source['receiptDigest']:reason='source_receipt_history_differs'
    elif source['pendingReceipts']>PENDING_LIMIT:reason='pending_limit_exceeded'
    elif source_time(source['readerExpires'])<=datetime.datetime.now(datetime.timezone.utc):reason='source_reader_expired'
    else:reason='consistent'
    return {'readyForCapture':reason=='consistent','reason':reason,'pendingLimit':PENDING_LIMIT,'nativeCandidate':state['candidate_sha256'] if state else None,**source,'writes':0}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--wrangler-auth',action='store_true');a=p.parse_args()
    result=inspect(r.Remote(wrangler_auth=a.wrangler_auth,generation=GENERATION));print(json.dumps(result,indent=2));raise SystemExit(0 if result['readyForCapture'] else 2)
