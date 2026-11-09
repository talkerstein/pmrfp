"""Prepare and commit one guarded incremental cycle against the copied preview.

Prepare is local and consumes an already captured Source snapshot. Commit uses
existing D1/Source credentials and can be resumed with the same run directory.
No scheduler, application-table writes on Source, or production target.
"""
import argparse,contextlib,datetime,fcntl,json,os,sqlite3,stat
from pathlib import Path
import acknowledge_capture as ack
import capture_state
import journal
import migrate as m
import rebuild_snapshot as rebuild
import remote as r
import remote_journal as replay

GENERATION='rebuilt-20261106'
TARGET=r.TARGETS[GENERATION][1]

def private_file(path):
    info=Path(path).lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:
        raise ValueError('An owner-only regular artifact is required')
    return Path(path)

def private_dir(path):
    path=Path(path);info=path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:
        raise ValueError('An owner-only run directory is required')
    return path

def write_report(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as stream:json.dump(value,stream,indent=2);stream.write('\n')

def emit(stage,**fields):
    print(json.dumps({'stage':stage,**fields}),flush=True)

class LocalTarget:
    name=TARGET
    def __init__(self,db):self.db=db
    def query(self,sql,params=None):return self.batch([{'sql':sql,'params':params or []}])
    def batch(self,items):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            results=[{'success':True,'results':[dict(row) for row in self.db.execute(item['sql'],item.get('params',[])).fetchall()]} for item in items]
            self.db.commit();return results
        except BaseException:self.db.rollback();raise

def capture_binding(source,base,candidate):
    ids,dataset=ack.plan(source,candidate)
    catalog=m.load_catalog();_,meta,source_sha=m.read_snapshot(source,catalog);_,_,base_sha=m.read_snapshot(base,catalog)
    capture=meta['change_capture']
    if capture.get('bootstrap') is not False or capture['base_candidate_sha256']!=base_sha:
        raise ValueError('Capture is not based on the supplied acknowledged candidate')
    return {'source':source_sha,'base':base_sha,'candidate':dataset,'receipts':len(ids),'capture':capture}

def prepare(source,base,baseline_backup,run_dir):
    source,base,baseline_backup=[private_file(p).resolve() for p in (source,base,baseline_backup)]
    work=Path(run_dir);work.mkdir(mode=0o700);private_dir(work)
    m.validate(base,baseline_backup)
    source_db=work/'source.sqlite';candidate=work/'candidate.jsonl';m.sync(source,source_db)
    rebuild.build(source,source_db,work/'candidate.sqlite',candidate,datetime.datetime.now(datetime.timezone.utc).isoformat())
    binding=capture_binding(source,base,candidate);capture=binding.pop('capture')
    plan=journal.plan(base,candidate);local=work/'local.sqlite';m.restore(baseline_backup,local)
    with contextlib.closing(m.connect(local)) as db:
        db.execute('CREATE TABLE _migration_manifest(id INTEGER PRIMARY KEY,source_sha256 TEXT,state TEXT)')
        db.execute("INSERT INTO _migration_manifest VALUES(1,?,'validated')",(binding['base'],));db.commit()
        if hasattr(db,'setlimit'):db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,64)
        target=LocalTarget(db)
        capture_state.write(target,capture['base_source_sha256'],binding['base'],capture['base_receipt_digest'])
        for label,reverse in [('forward',False),('reverse',True),('reapply',False)]:
            replay.apply(target,base,candidate,plan,work/f'local-before-{label}.sqlite',reverse=reverse,allow_copied_preview=True)
    report={**binding,'sourcePath':str(source),'basePath':str(base),'changes':len(plan['changes']),'localForwardReverseReapply':True}
    write_report(work/'prepared.json',report);return report

def reusable_backup(snapshot,path):
    if not path.exists():return path
    m.validate(snapshot,private_file(path));return None

def verify_restore(snapshot,backup,restored):
    m.validate(snapshot,private_file(backup))
    if not restored.exists():m.restore(backup,restored)
    m.validate(snapshot,private_file(restored))

def commit(remote,run_dir):
    if remote.name!=TARGET:raise ValueError('Only the current copied preview is allowed')
    work=private_dir(run_dir);report=json.loads(private_file(work/'prepared.json').read_text())
    source=private_file(report['sourcePath']);base=private_file(report['basePath']);candidate=private_file(work/'candidate.jsonl')
    binding=capture_binding(source,base,candidate);capture=binding.pop('capture')
    plan=journal.plan(base,candidate)
    if any(report.get(k)!=v for k,v in binding.items()) or report.get('changes')!=len(plan['changes']) or report.get('localForwardReverseReapply') is not True:
        raise ValueError('Prepared run does not match its artifacts')
    ack.check_source_environment()
    state=capture_state.read(remote)
    baseline=state and (state['source_sha256'],state['candidate_sha256'],state['receipt_digest'])==(capture['base_source_sha256'],binding['base'],capture['base_receipt_digest'])
    completed=state and (state['source_sha256'],state['candidate_sha256'])==(binding['source'],binding['candidate'])
    if not (baseline or completed):raise ValueError('Run does not match the durable consumer checkpoint')
    history=capture_state.source_digest(exclude_ids=capture['ids'] if baseline else None,dataset=binding['candidate'])
    if history['receiptDigest']!=state['receipt_digest']:raise ValueError('Source receipt history differs from this exact run')
    before=work/'native-before.sqlite';after=work/'native-after.sqlite'
    before_output=reusable_backup(base,before);after_output=reusable_backup(candidate,after)
    if binding['base']==binding['candidate']:raise ValueError('Incremental run must have a distinct captured checkpoint')
    manifest=r.manifest(remote)
    if manifest and manifest[0]['source_sha256']==binding['candidate'] and not before.exists():
        raise ValueError('Cannot recover without a validated before backup')
    result=replay.apply(remote,base,candidate,plan,before_output,allow_copied_preview=True,final_backup_path=after_output)
    emit('native-verified',records=result['records'],changes=len(plan['changes']))
    verify_restore(base,before,work/'restored-before.sqlite');verify_restore(candidate,after,work/'restored-after.sqlite')
    emit('backups-restored')
    receipt=ack.acknowledge(remote,source,candidate)
    return {'native':result,'backupsRestored':True,'acknowledgement':receipt}

def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    prep=sub.add_parser('prepare')
    for name in ['source-snapshot','base-candidate','baseline-backup','run-dir']:prep.add_argument('--'+name,required=True)
    execute=sub.add_parser('commit');execute.add_argument('--run-dir',required=True);execute.add_argument('--wrangler-auth',action='store_true')
    args=parser.parse_args()
    if args.command=='prepare':
        result=prepare(args.source_snapshot,args.base_candidate,args.baseline_backup,args.run_dir);emit('prepared',**{k:v for k,v in result.items() if not k.endswith('Path')});return
    directory=private_dir(m.ROOT/'.d1-private');fd=os.open(directory/'incremental-consumer.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'r+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        result=commit(r.Remote(wrangler_auth=args.wrangler_auth,generation=GENERATION),args.run_dir)
        work=private_dir(args.run_dir);stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f')
        write_report(work/('committed-'+stamp+'.json'),result);emit('acknowledged',**result['acknowledgement'])

if __name__=='__main__':main()
