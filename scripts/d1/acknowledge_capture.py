"""Acknowledge private source outbox receipts only after complete native D1 validation.

Default is a local plan. No application-table writes, credentials in argv, or
ID watermark. A reversed D1 checkpoint requires a new source bootstrap.
"""
import argparse,json,os,re,subprocess
import migrate as m
import remote as r
import rebuild_snapshot as rebuild
from change_capture import READER

PROJECT='tumexryzbzmtijvbloch'
TARGET='pmrfp-rebuilt-staging-20261029'

def plan(source_snapshot,candidate_snapshot):
    catalog=m.load_catalog();source,meta,source_sha=m.read_snapshot(source_snapshot,catalog)
    candidate,candidate_meta,candidate_sha=m.read_snapshot(candidate_snapshot,catalog)
    capture=meta.get('change_capture',{})
    ids=capture.get('ids')
    if meta.get('source')!='postgres-repeatable-read' or capture.get('protocol')!=1 or capture.get('bootstrap') is not True or not isinstance(ids,list) or len(ids)>75000:
        raise ValueError('A consistent post-install source bootstrap with captured receipt IDs is required')
    if any(not isinstance(i,str) or not re.fullmatch(r'[1-9][0-9]{0,18}',i) or int(i)>2**63-1 for i in ids) or [int(i) for i in ids]!=sorted({int(i) for i in ids}):
        raise ValueError('Invalid, duplicate or unordered receipt IDs')
    policy_path=m.ROOT/'d1/rebuild-policy.json'
    if candidate_meta.get('source')!='approved-derived-rebuild' or candidate_meta.get('parent_snapshot_sha256')!=source_sha or candidate_meta.get('rebuild_policy_sha256')!=m.digest(policy_path.read_bytes()):
        raise ValueError('Candidate is not the approved rebuild of the captured source bootstrap')
    rebuild.check_preserved(source,candidate,json.loads(policy_path.read_text()))
    return ids,candidate_sha

def acknowledgement_sql(ids,dataset):
    if not ids or len(ids)>500 or len(set(ids))!=len(ids) or any(not isinstance(i,str) or not re.fullmatch(r'[1-9][0-9]{0,18}',i) or int(i)>2**63-1 for i in ids) or not re.fullmatch(r'[a-f0-9]{64}',dataset):
        raise ValueError('Invalid bounded acknowledgement')
    return f'''BEGIN READ WRITE;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $guard$ BEGIN
 IF current_user<>'{READER}' OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN
  RAISE EXCEPTION 'Unexpected application write permissions';
 END IF;
END $guard$;
SELECT d1_migration.acknowledge(ARRAY[{','.join(ids)}]::bigint[],'{dataset}');
COMMIT;
'''

def acknowledge(remote,source_snapshot,candidate_snapshot,runner=subprocess.run):
    ids,dataset=plan(source_snapshot,candidate_snapshot)
    if remote.name!=TARGET:raise ValueError('Only the pinned copied-data preview may acknowledge source capture')
    if os.environ.get('PGUSER')!=READER+'.'+PROJECT or os.environ.get('PGHOST')!='aws-1-us-west-2.pooler.supabase.com' or os.environ.get('PGPORT')!='5432' or os.environ.get('PGSSLMODE')!='verify-full' or not os.environ.get('PGSSLROOTCERT'):
        raise ValueError('Pinned source reader and verified TLS are required')
    verified=r.verify(remote,candidate_snapshot)
    total=0
    for offset in range(0,len(ids),500):
        group=ids[offset:offset+500]
        result=runner(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],input=acknowledgement_sql(group,dataset).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=45)
        if result.returncode:raise RuntimeError('Private queue acknowledgement failed; diagnostics suppressed')
        count=result.stdout.decode().strip()
        if not count.isdecimal() or not 0<=int(count)<=len(group):raise RuntimeError('Unexpected private queue acknowledgement result')
        total+=int(count)
    return {'capturedReceipts':len(ids),'newAcknowledgements':total,'dataset':dataset,'nativeRecordsVerified':verified['records'],'sourceApplicationWrites':0,'customerRowsChanged':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-snapshot',required=True);p.add_argument('--candidate-snapshot',required=True);p.add_argument('--commit-ack',action='store_true');p.add_argument('--wrangler-auth',action='store_true');args=p.parse_args()
    ids,dataset=plan(args.source_snapshot,args.candidate_snapshot)
    if not args.commit_ack:result={'plannedReceipts':len(ids),'dataset':dataset,'sourceQueueWrites':0,'dryRun':True}
    else:result=acknowledge(r.Remote(wrangler_auth=args.wrangler_auth,generation='rebuilt-20261029'),args.source_snapshot,args.candidate_snapshot)
    print(json.dumps(result,indent=2))
