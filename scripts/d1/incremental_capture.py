"""Read current rows for ALL pending source keys in one consistent transaction.

Reconstruct a full local source snapshot; preserve deletes, PK changes, TRUNCATE,
late sequence IDs and exact scalar types. Auth ID-only shim is refreshed in full.
No source writes or acknowledgements. Requires a verified, acknowledged baseline.
"""
import argparse,hashlib,json,os,re,subprocess,tempfile
from pathlib import Path
import migrate as m
import remote as r
import rebuild_snapshot as rebuild
import acknowledge_capture as a
import capture_state as state
from change_capture import literal,function_guard,role_guard

def guard(expression):return 'SELECT 1 / CASE WHEN ('+expression+') THEN 1 ELSE 0 END \\g /dev/null'

def source_sql(catalog,checkpoint,verify_full=False,guards_only=False):
    checkpoint=state.validate(checkpoint);specs=m.table_specs(catalog);tables=sorted(t for t in specs if t!='_auth_users')
    pending="acknowledged_at IS NULL"
    registry=[{'table':t,'pk':specs[t]['pk']} for t in tables]
    sql=['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',"SET LOCAL timezone='UTC';","SET LOCAL search_path=pg_catalog,public;","SET LOCAL statement_timeout='5min';"]
    sql.append(guard(role_guard()))
    sql.append(guard("(SELECT obj_description(oid,'pg_namespace') FROM pg_namespace WHERE nspname='d1_migration')='pmrfp-d1-change-capture-v1; reviewed 2026-10-31'"))
    sql.append(guard("(SELECT count(*) FROM d1_migration.outbox WHERE "+pending+")<=75000"))
    sql.append(guard("(SELECT "+state.DIGEST_EXPRESSION+" FROM d1_migration.outbox WHERE acknowledged_at IS NOT NULL)="+literal(checkpoint['receipt_digest'])))
    sql.append(guard("(SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public')="+literal(m.canonical(tables))+"::jsonb"))
    sql.append(guard("(SELECT jsonb_agg(jsonb_build_object('table',table_name,'pk',pk_columns) ORDER BY table_name) FROM d1_migration.registered_tables)="+literal(m.canonical(registry))+"::jsonb"))
    sql.append(guard("(SELECT jsonb_agg(jsonb_build_object('table',t.tablename,'pk',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.conrelid=format('%I.%I',t.schemaname,t.tablename)::regclass AND c.contype='p')) ORDER BY t.tablename) FROM pg_tables t WHERE t.schemaname='public')="+literal(m.canonical(registry))+"::jsonb"))
    sql.append(guard(function_guard(catalog)))
    if 'functions' in catalog:
        sql.append(guard("COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')),'[]'::jsonb)="+literal(m.canonical(catalog['functions']))+"::jsonb"))
    if 'rfp_posts' in specs:
        sql.append(guard("EXISTS(SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=g.tgfoid JOIN pg_namespace fn ON fn.oid=p.pronamespace WHERE n.nspname='public' AND c.relname='rfp_posts' AND g.tgname='rfp_posts_set_updated' AND g.tgenabled='O' AND g.tgtype=19 AND g.tgqual IS NULL AND g.tgnargs=0 AND g.tgattr=''::int2vector AND fn.nspname='public' AND p.proname='set_updated_at')"))
    # Aggregate metadata guards avoid hundreds of source network round trips.
    # Refuse disabled, replaced, conditional, column-specific or absent triggers.
    triggers=[{'table':t,'trigger':name,'type':kind,'function':'d1_migration.'+fn,'enabled':'O','conditional':False,'args':0,'columns':'','internal':False} for t in tables for name,kind,fn in [('d1_migration_capture',29,'capture_row'),('d1_migration_truncate',32,'capture_truncate')]]
    sql.append(guard("(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'trigger',g.tgname,'type',g.tgtype::integer,'function',n.nspname||'.'||p.proname,'enabled',g.tgenabled,'conditional',g.tgqual IS NOT NULL,'args',g.tgnargs,'columns',g.tgattr::text,'internal',g.tgisinternal) ORDER BY c.relname,g.tgname) FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace tn ON tn.oid=c.relnamespace JOIN pg_proc p ON p.oid=g.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE tn.nspname='public' AND g.tgname IN ('d1_migration_capture','d1_migration_truncate'))="+literal(m.canonical(triggers))+"::jsonb"))
    columns=[{'table_name':t,**{k:c[k] for k in ['column_name','udt_name','is_generated']}} for t in tables for c in specs[t]['columns']]
    sql.append(guard("(SELECT jsonb_agg(jsonb_build_object('table_name',c.table_name,'column_name',c.column_name,'udt_name',c.udt_name,'is_generated',c.is_generated) ORDER BY c.table_name,c.ordinal_position) FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE')="+literal(m.canonical(columns))+"::jsonb"))
    if guards_only:return '\n'.join(sql+['COMMIT;'])
    meta={'kind':'capture-meta','catalog_sha256':m.digest(m.CATALOG.read_bytes()),'base_source_sha256':checkpoint['source_sha256'],'base_candidate_sha256':checkpoint['candidate_sha256'],'base_receipt_digest':checkpoint['receipt_digest'],'tables':sorted(specs)}
    sql.append("SELECT ("+literal(m.canonical(meta))+"::jsonb || jsonb_build_object('ids',(SELECT COALESCE(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM d1_migration.outbox WHERE "+pending+"),'replaced_tables',(SELECT jsonb_agg(t ORDER BY t) FROM (SELECT DISTINCT table_name AS t FROM d1_migration.outbox WHERE "+pending+" AND operation='truncate' UNION SELECT '_auth_users') q)))::text;")
    def projection(spec,alias):
        return ','.join(alias+'.'+m.ident(c['column_name'])+('::text AS '+m.ident(c['column_name']) if c['udt_name']=='numeric' else '') for c in spec['columns'])
    selects=[]
    for t in tables:
        spec=specs[t];relation='public.'+m.ident(t);full="EXISTS(SELECT 1 FROM d1_migration.outbox WHERE "+pending+" AND table_name="+literal(t)+" AND operation='truncate')"
        kinds={c['column_name']:c['udt_name'] for c in spec['columns']}
        keys=','.join('k.'+m.ident(k)+('::text' if kinds[k]=='numeric' else '') for k in spec['pk'])
        match=' AND '.join('target.'+m.ident(k)+'=k.'+m.ident(k) for k in spec['pk'])
        current='(SELECT row_to_json(current_row) FROM (SELECT '+projection(spec,'target')+' FROM '+relation+' target WHERE '+match+') current_row)'
        selects.append("SELECT json_build_object('table',"+literal(t)+",'key',json_build_array("+keys+"),'row',"+current+")::text FROM (SELECT DISTINCT key FROM d1_migration.outbox WHERE "+pending+" AND table_name="+literal(t)+" AND operation<>'truncate') e CROSS JOIN LATERAL jsonb_populate_record(NULL::"+relation+",e.key) k WHERE NOT "+full)
        selects.append("SELECT json_build_object('table',"+literal(t)+",'replacement',true,'row',row_to_json(current_row))::text FROM (SELECT "+projection(spec,'target')+' FROM '+relation+' target WHERE '+full+') current_row')
    selects.append("SELECT json_build_object('table','_auth_users','replacement',true,'row',json_build_object('id',id))::text FROM public.d1_migration_auth_ids_20261022")
    if verify_full:
        for t in tables:
            selects.append("SELECT json_build_object('full_check',true,'table',"+literal(t)+",'row',row_to_json(current_row))::text FROM (SELECT "+projection(specs[t],'target')+' FROM public.'+m.ident(t)+' target) current_row')
        selects.append("SELECT json_build_object('full_check',true,'table','_auth_users','row',json_build_object('id',id))::text FROM public.d1_migration_auth_ids_20261022")
    sql.append('\nUNION ALL\n'.join(selects)+';')
    sql.append('COMMIT;');return '\n'.join(sql)

def normalized(row,spec):
    if not isinstance(row,dict) or set(row)!={c['column_name'] for c in spec['columns']}:raise ValueError('Incomplete incremental row')
    result={c['column_name']:m.normalize(row[c['column_name']],c['udt_name']) for c in spec['columns']}
    if any(result[k] is None for k in spec['pk']):raise ValueError('Null incremental primary key')
    return result

def reconstruct(base_snapshot,delta_path,output,verify_full=False):
    catalog=m.load_catalog();specs=m.table_specs(catalog);rows,_,base_sha=m.read_snapshot(base_snapshot,catalog)
    header=None;footer=None;h=hashlib.sha256();seen=set();full={t:{} for t in specs};transferred=0;delta_bytes=0;full_bytes=0
    with Path(delta_path).open('rb') as stream:
        for line in stream:
            record=m.parse_json(line)
            if record.get('kind')=='capture-footer':
                if footer is not None:raise ValueError('Duplicate incremental footer')
                footer=record;continue
            if footer is not None:raise ValueError('Data after incremental footer')
            h.update(line)
            if header is None:
                header=record
                if header.get('kind')!='capture-meta' or header.get('catalog_sha256')!=m.digest(m.CATALOG.read_bytes()) or header.get('base_source_sha256')!=base_sha or header.get('tables')!=sorted(specs):raise ValueError('Incremental baseline/catalog mismatch')
                ids=header.get('ids');replaced=header.get('replaced_tables')
                if not isinstance(ids,list) or len(ids)>75000 or any(not isinstance(i,str) or not re.fullmatch(r'[1-9][0-9]{0,18}',i) or int(i)>2**63-1 for i in ids) or [int(i) for i in ids]!=sorted({int(i) for i in ids}):raise ValueError('Invalid incremental receipts')
                if not isinstance(replaced,list) or '_auth_users' not in replaced or replaced!=sorted(set(replaced)) or any(t not in specs for t in replaced):raise ValueError('Invalid replacement-table inventory')
                if any(not isinstance(header.get(k),str) or not re.fullmatch(r'[a-f0-9]{64}',header[k]) for k in ['base_candidate_sha256','base_receipt_digest']):raise ValueError('Invalid durable baseline identity')
                for t in replaced:rows[t]={}
                delta_bytes+=len(line);continue
            t=record.get('table')
            if t not in specs:raise ValueError('Unknown incremental table')
            spec=specs[t]
            if record.get('full_check') is True:
                if set(record)!={'full_check','table','row'}:raise ValueError('Malformed full-check record')
                if not verify_full:raise ValueError('Unexpected full-check rows')
                row=normalized(record.get('row'),spec);key=m.canonical([row[k] for k in spec['pk']])
                if key in full[t]:raise ValueError('Duplicate full-check key')
                full[t][key]=row;full_bytes+=len(line);continue
            delta_bytes+=len(line);transferred+=1
            if record.get('replacement') is True:
                if set(record)!={'replacement','table','row'}:raise ValueError('Malformed replacement record')
                if t not in header['replaced_tables']:raise ValueError('Unexpected full-table replacement')
                row=normalized(record.get('row'),spec);key=m.canonical([row[k] for k in spec['pk']])
            else:
                if set(record)!={'table','key','row'}:raise ValueError('Malformed keyed record')
                if t in header['replaced_tables']:raise ValueError('Mixed replacement/keyed records')
                raw_key=record.get('key')
                if not isinstance(raw_key,list) or len(raw_key)!=len(spec['pk']):raise ValueError('Invalid incremental key')
                types={c['column_name']:c['udt_name'] for c in spec['columns']}
                values=[m.normalize(v,types[k]) for k,v in zip(spec['pk'],raw_key)]
                if any(v is None for v in values):raise ValueError('Null incremental key')
                key=m.canonical(values);row=normalized(record['row'],spec) if record.get('row') is not None else None
                if row is not None and m.canonical([row[k] for k in spec['pk']])!=key:raise ValueError('Incremental key/row mismatch')
            if (t,key) in seen:raise ValueError('Duplicate incremental key')
            seen.add((t,key))
            if row is None:rows[t].pop(key,None)
            else:rows[t][key]=row
    if header is None or footer is None or footer.get('sha256')!=h.hexdigest():raise ValueError('Incomplete or corrupted incremental capture')
    if verify_full and m.compare(rows,full)!={t:{'inserted':0,'deleted':0,'updated':0} for t in specs}:raise ValueError('Incremental reconstruction differs from same-transaction full source')
    meta={'kind':'meta','source':'postgres-repeatable-read-incremental','catalog_sha256':m.digest(m.CATALOG.read_bytes()),'tables':sorted(specs),'change_capture':{'protocol':1,'bootstrap':False,'ids':header['ids'],**{k:header[k] for k in ['base_source_sha256','base_candidate_sha256','base_receipt_digest']}}}
    target=Path(output)
    if target.exists():raise FileExistsError('Refusing to replace an incremental snapshot')
    fd,tmp=tempfile.mkstemp(prefix='.d1-incremental-',dir=target.parent);os.close(fd)
    try:
        sha=hashlib.sha256()
        with open(tmp,'wb') as f:
            def emit(record):
                data=(m.canonical(record)+'\n').encode();sha.update(data);f.write(data)
            emit(meta)
            for t in sorted(specs):
                for key in sorted(rows[t]):emit({'table':t,'row':rebuild.denormalize(rows[t][key],specs[t])})
            f.write((m.canonical({'kind':'footer','sha256':sha.hexdigest(),'counts':{t:len(v) for t,v in rows.items()}})+'\n').encode())
        with tempfile.TemporaryDirectory(prefix='.d1-incremental-check-',dir=target.parent) as folder:m.sync(tmp,Path(folder)/'validated.sqlite')
        os.link(tmp,target)
    finally:Path(tmp).unlink(missing_ok=True)
    return {'source_snapshot_sha256':sha.hexdigest(),'records':sum(map(len,rows.values())),'capturedReceipts':len(header['ids']),'transferredRowRecords':transferred,'incrementalTransferBytes':delta_bytes,'fullVerificationBytes':full_bytes,'sameTransactionFullComparison':verify_full,'sourceWrites':0}

def export(remote,base_source,base_candidate,output,delta_path,verify_full=False,runner=subprocess.run):
    if remote.name!=a.TARGET:raise ValueError('Incremental export requires the pinned copied preview')
    a.check_source_environment()
    catalog=m.load_catalog();source,_,source_sha=m.read_snapshot(base_source,catalog);candidate,_,candidate_sha=m.read_snapshot(base_candidate,catalog)
    a.plan(base_source,base_candidate);rebuild.check_preserved(source,candidate,json.loads((m.ROOT/'d1/rebuild-policy.json').read_text()))
    checkpoint=state.read(remote)
    if checkpoint is None or checkpoint['source_sha256']!=source_sha or checkpoint['candidate_sha256']!=candidate_sha:raise ValueError('Missing or unrelated durable consumer checkpoint')
    r.verify(remote,base_candidate)
    out=Path(output);delta=Path(delta_path)
    if out.exists() or delta.exists():raise FileExistsError('Incremental capture requires new output paths')
    fd,tmp=tempfile.mkstemp(prefix='.d1-capture-',dir=delta.parent);os.close(fd)
    try:
        with open(tmp,'wb') as f:result=runner(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],input=source_sql(catalog,checkpoint,verify_full).encode(),stdout=f,stderr=subprocess.PIPE,timeout=360)
        if result.returncode:raise RuntimeError('Consistent incremental source read failed; diagnostics suppressed')
        sha=hashlib.sha256()
        with open(tmp,'rb') as f:
            for line in f:sha.update(line)
        with open(tmp,'ab') as f:f.write((m.canonical({'kind':'capture-footer','sha256':sha.hexdigest()})+'\n').encode())
        report=reconstruct(base_source,tmp,out,verify_full);os.link(tmp,delta)
        return report
    finally:Path(tmp).unlink(missing_ok=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['base-source','base-candidate','output','delta-output']:p.add_argument('--'+name,required=True)
    p.add_argument('--verify-full-source',action='store_true');p.add_argument('--wrangler-auth',action='store_true');args=p.parse_args()
    print(json.dumps(export(r.Remote(wrangler_auth=args.wrangler_auth,generation='rebuilt-20261029'),args.base_source,args.base_candidate,args.output,args.delta_output,args.verify_full_source),indent=2))
