"""Create a separately checksummed rebuilt dataset from a validated source copy.

All unlisted fields and unknown catalog tables must remain identical. The source
snapshot and source database are never modified. Node 24+ runs the app's scorer.
"""
import argparse,contextlib,hashlib,json,os,subprocess
from pathlib import Path
import migrate as m

def check_preserved(source,candidate,policy):
    if set(source)!=set(candidate):raise ValueError('Rebuild changed table coverage')
    for table,rows in source.items():
        if table in policy['rebuildTables']:continue
        if table in policy['resetTables']:
            if candidate[table]:raise ValueError('Transient reset table is not empty')
            continue
        if set(rows)!=set(candidate[table]):raise ValueError('Rebuild changed authoritative row keys: '+table)
        excluded=set(policy['rebuildColumns'].get(table,[]))
        for key,row in rows.items():
            other=candidate[table][key]
            if set(row)!=set(other):raise ValueError('Rebuild changed columns: '+table)
            if any(v!=other[k] for k,v in row.items() if k not in excluded):raise ValueError('Rebuild changed authoritative fields: '+table)

def denormalize(row,spec):
    result={}
    for c in spec['columns']:
        k=c['column_name'];v=row[k];typ=c['udt_name']
        if v is not None:
            if typ=='bool':
                if v not in (0,1):raise ValueError('Invalid rebuilt boolean')
                v=bool(v)
            elif typ=='jsonb' or typ.startswith('_'):v=m.parse_json(v)
        result[k]=v
    return result

def build(snapshot,source,target,output,scored_at):
    target=Path(target);output=Path(output)
    if target.exists() or output.exists():raise FileExistsError('Rebuild requires new target and snapshot paths')
    catalog=m.load_catalog();specs=m.table_specs(catalog)
    expected,_,parent_sha=m.read_snapshot(snapshot,catalog)
    m.validate(snapshot,source)
    policy_path=m.ROOT/'d1/rebuild-policy.json';policy=json.loads(policy_path.read_text())
    # The rebuild implementation creates a new private copy and validates all
    # authoritative fields before committing its transaction.
    subprocess.run(['node',str(m.ROOT/'scripts/d1/rebuild.mjs'),str(source),str(target),scored_at],check=True,capture_output=True,text=True)
    with contextlib.closing(m.connect(target)) as db:
        candidate=m.read_target(db,specs);check_preserved(expected,candidate,policy)
        m.check(db,candidate,specs)
    meta={'kind':'meta','source':'approved-derived-rebuild','catalog_sha256':m.digest(m.CATALOG.read_bytes()),'tables':sorted(specs),'parent_snapshot_sha256':parent_sha,'rebuild_policy_sha256':m.digest(policy_path.read_bytes()),'scored_at':scored_at}
    fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);h=hashlib.sha256()
    try:
        with os.fdopen(fd,'wb') as f:
            def emit(record):
                data=(m.canonical(record)+'\n').encode();h.update(data);f.write(data)
            emit(meta)
            for table in sorted(specs):
                for key in sorted(candidate[table]):emit({'table':table,'row':denormalize(candidate[table][key],specs[table])})
            counts={table:len(rows) for table,rows in candidate.items()}
            f.write((m.canonical({'kind':'footer','sha256':h.hexdigest(),'counts':counts})+'\n').encode())
        m.validate(output,target)
    except BaseException:
        output.unlink(missing_ok=True);raise
    return {'source_snapshot_sha256':parent_sha,'rebuilt_snapshot_sha256':h.hexdigest(),'tables':len(specs),'records':sum(counts.values()),'scored_at':scored_at,'authoritative_fields':'identical','rebuilt_fields':'approved-policy-only','cutover_ready':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['source-snapshot','source-db','target-db','output','scored-at','report']:p.add_argument('--'+name,required=True)
    a=p.parse_args()
    if Path(a.report).exists():raise FileExistsError('Refusing to replace an existing report')
    result=build(a.source_snapshot,a.source_db,a.target_db,a.output,a.scored_at)
    fd=os.open(a.report,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,indent=2)
    print(json.dumps(result))
