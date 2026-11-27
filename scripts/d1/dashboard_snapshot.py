"""Convert a SQL Editor CSV (table_name, rows, row_count, source_md5) to JSONL.
Only use with the single read-only, repeatable-read export query generated here.
CSV and snapshots contain private user data: keep them out of Git and logs.
"""
import argparse,csv,hashlib,json,os
from pathlib import Path
import migrate as m

def sql(catalog):
    specs=m.table_specs(catalog);queries=[]
    for t,spec in specs.items():
        if t=='_auth_users':expr="json_build_object('id',id)";relation='auth.users'
        else:
            expr='to_jsonb(t)';relation='public.'+m.ident(t)
            numeric=[c['column_name'] for c in spec['columns'] if c['udt_name']=='numeric']
            if numeric:expr+=' || jsonb_build_object('+','.join("'"+n+"', t."+m.ident(n)+'::text' for n in numeric)+')'
        queries.append("SELECT '"+t+"' AS table_name, coalesce(json_agg("+expr+"),'[]'::json)::text AS rows FROM "+relation+' t')
    expected=sorted(t for t in specs if t!='_auth_users')
    guard="SELECT 1 / CASE WHEN (SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public') = '"+m.canonical(expected).replace("'","''")+"'::jsonb THEN 1 ELSE 0 END;\n"
    cols=[{'table_name':c['table_name'],'column_name':c['column_name'],'udt_name':c['udt_name'],'is_generated':c['is_generated']} for c in catalog['columns']]
    expression="(SELECT jsonb_agg(jsonb_build_object('table_name',c.table_name,'column_name',c.column_name,'udt_name',c.udt_name,'is_generated',c.is_generated) ORDER BY c.table_name,c.ordinal_position) FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE')"
    guard+="SELECT 1 / CASE WHEN "+expression+" = '"+m.canonical(cols).replace("'","''")+"'::jsonb THEN 1 ELSE 0 END;\n"
    return "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL timezone='UTC';\n"+guard+"SELECT table_name, rows, md5(rows) AS source_md5, json_array_length(rows::json) AS row_count FROM (\n"+'\nUNION ALL\n'.join(queries)+'\n) snapshot;\nCOMMIT;\n'

def convert(source,output,require_checksums=True):
    csv.field_size_limit(100_000_000)
    specs=m.table_specs(m.load_catalog());seen=set();counts={};h=hashlib.sha256()
    fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,'wb') as f:
            def emit(x):
                data=(m.canonical(x)+'\n').encode();h.update(data);f.write(data)
            emit({'kind':'meta','source':'production-dashboard-repeatable-read','catalog_sha256':m.digest(m.CATALOG.read_bytes()),'tables':sorted(specs)})
            with open(source,newline='') as raw:
                for entry in csv.DictReader(raw):
                    table=entry['table_name']
                    if table in seen or table not in specs:raise ValueError('Unexpected/duplicate table')
                    seen.add(table);text=entry['rows'];rows=m.parse_json(text)
                    if require_checksums:
                        if hashlib.md5(text.encode()).hexdigest()!=entry['source_md5']:raise ValueError('Source checksum mismatch')
                        if len(rows)!=int(entry['row_count']):raise ValueError('Source count mismatch')
                    counts[table]=len(rows)
                    for row in rows:emit({'table':table,'row':row})
            if seen!=set(specs):raise ValueError('Incomplete table coverage')
            f.write((m.canonical({'kind':'footer','sha256':h.hexdigest(),'counts':counts})+'\n').encode())
        m.read_snapshot(output,m.load_catalog())
    except BaseException:
        Path(output).unlink(missing_ok=True);raise
    return {'tables':len(counts),'rows':sum(counts.values()),'sha256':h.hexdigest()}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['sql','convert']);p.add_argument('--input');p.add_argument('--output',required=True);a=p.parse_args()
    if a.command=='sql':Path(a.output).write_text(sql(m.load_catalog()))
    else:print(json.dumps(convert(a.input,a.output)))
