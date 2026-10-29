"""Deterministic candidate D1 schema; every unsupported behavior is recorded."""
import argparse, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def ident(s):
    return '"'+s.replace('"','""')+'"'
def convert_expr(s):
    s=re.sub(r'::(?:text|uuid|numeric|integer|smallint|bigint|boolean|double precision)(?:\[\])?', '', s)
    s=re.sub(r'= ANY \(ARRAY\[(.*?)\]\)',r'IN (\1)',s)
    s=re.sub(r'<> ALL \(ARRAY\[(.*?)\]\)',r'NOT IN (\1)',s)
    for a,b in [('char_length(', 'length('),('jsonb_typeof(', 'json_type('),('jsonb_array_length(', 'json_array_length('),('cardinality(', 'json_array_length(')]:s=s.replace(a,b)
    s=s.replace(' ~~ ', ' LIKE ')
    if any(t in s for t in ['::','~','<@','@>','&&','ARRAY[','ANY (','ALL (']):raise ValueError('Postgres expression requires explicit port')
    return s

def generate(c,public_board_index=False):
    gaps=[]; statements=['-- STAGING COPY ONLY. No RLS, RPCs, views or application triggers are provided.', 'PRAGMA foreign_keys=ON;', 'CREATE TABLE "_auth_users" ("id" TEXT NOT NULL PRIMARY KEY);']
    tables=sorted(set(x['table_name'] for x in c['columns']))
    for table in tables:
        cols=[x for x in c['columns'] if x['table_name']==table]; parts=[]
        for col in cols:
            name=col['column_name']; typ=col['udt_name']; default=col['column_default']; dtype='TEXT'
            if typ in ['int2','int4','int8','bool']:dtype='INTEGER'
            if typ not in ['text','uuid','timestamptz','date','numeric','int2','int4','int8','bool','_text','_uuid','jsonb','award_end_date_source']:raise ValueError(f'Unmapped type {typ}')
            part=f'{ident(name)} {dtype}'
            if col['is_nullable']=='NO':part+=' NOT NULL'
            if default is not None:
                converted=None
                if default=='now()':converted="(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
                elif default=='CURRENT_DATE':converted='CURRENT_DATE'
                elif default in ['true','false']:converted='1' if default=='true' else '0'
                elif re.fullmatch(r'-?\d+(\.\d+)?',default):converted=default
                elif re.fullmatch(r"'(?:[^']|'')*'::(?:text|jsonb|text\[\]|uuid\[\])",default):
                    converted=default.split('::')[0]
                    if typ.startswith('_'):converted="'[]'"
                if converted is not None:part+=' DEFAULT '+converted
                else:gaps.append({'kind':'default','table':table,'column':name,'definition':default})
            if col['is_identity']=='YES':gaps.append({'kind':'identity','table':table,'column':name})
            if col['is_generated']!='NEVER':
                part+=' GENERATED ALWAYS AS ('+convert_expr(col['generation_expression']).replace('btrim(', 'trim(')+') STORED'
            if typ=='bool':part+=f' CHECK ({ident(name)} IN (0,1))'
            if typ in ['_text','_uuid','jsonb']:
                part+=f' CHECK ({ident(name)} IS NULL OR json_valid({ident(name)}))'
                if typ.startswith('_'):part+=f" CHECK (json_type({ident(name)})='array')"
            parts.append(part)
        for con in [x for x in c['constraints'] if x['table_name']==table]:
            d=con['definition']
            if con['type']=='f':d=d.replace('auth.users','"_auth_users"').replace('public.','')
            elif con['type']=='c':
                try:d=convert_expr(d)
                except ValueError:gaps.append({'kind':'check','table':table,'name':con['name'],'definition':d});continue
            elif con['type'] not in ['p','u']:raise ValueError(f'Unsupported constraint: {con}')
            parts.append('CONSTRAINT '+ident(con['name'])+' '+d)
        statements.append('CREATE TABLE '+ident(table)+' (\n  '+',\n  '.join(parts)+'\n);')
    # Preserve plain and expression indexes where SQLite understands their expressions.
    constraint_names={x['name'] for x in c['constraints'] if x['type'] in ['p','u']}
    for idx in c['indexes']:
        if idx['indexname'] in constraint_names:continue
        s=idx['indexdef'].replace('public.','').replace(' USING btree','')
        try:
            s=convert_expr(s)
            if any(t in s for t in [' USING ', 'NULLS ', 'date_trunc(', 'normalize_email(', 'AT TIME ZONE','::']):raise ValueError()
            statements.append(s+';')
        except ValueError:gaps.append({'kind':'index','table':idx['tablename'],'name':idx['indexname'],'definition':idx['indexdef']})
    for kind,key in [('policy','policies'),('function','functions'),('trigger','triggers'),('view','views'),('event-trigger','event_triggers')]:
        for item in c.get(key,[]):gaps.append({'kind':kind,**item})
    if public_board_index:
        if not {'id','status'}.issubset({x['column_name'] for x in c['columns'] if x['table_name']=='rfp_posts'}):raise ValueError('Public board index requires audited RFP columns')
        statements.append('CREATE INDEX d1_rfp_posts_status_id_idx ON rfp_posts(status,id);')
    gaps+= [{'kind':'index-extension',**x} for x in c.get('adaptations',[])]
    return '\n\n'.join(statements)+'\n',gaps
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--catalog',default=str(ROOT/'d1/postgres-catalog.json'))
    p.add_argument('--sql',default=str(ROOT/'d1/0001-staging-copy.sql'))
    p.add_argument('--gaps',default=str(ROOT/'d1/porting-gaps.json'))
    p.add_argument('--public-board-index',action='store_true',help='Add the audited D1 status/id board serving index')
    a=p.parse_args();c=json.loads(Path(a.catalog).read_text());sql,gaps=generate(c,a.public_board_index)
    Path(a.sql).write_text(sql)
    Path(a.gaps).write_text(json.dumps(gaps,indent=2)+'\n')
    print(json.dumps({'tables':len(set(x['table_name'] for x in c['columns'])),'unported_behaviors':len(gaps)}))
