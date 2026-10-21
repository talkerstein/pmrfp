"""Generate a D1 SQL import from a validated local copy. Never runs remote SQL.
Use a NEW, private staging database only. SQL contains private application data.
"""
import argparse,contextlib,os
from pathlib import Path
import migrate as m

def literal(v):
    if v is None:return 'NULL'
    if isinstance(v,int):return str(v)
    if not isinstance(v,str):raise ValueError('Unsupported SQLite value')
    if '\x00' in v:return "CAST(X'"+v.encode().hex()+"' AS TEXT)"
    return "'"+v.replace("'","''")+"'"

def generate(snapshot,target,output):
    m.validate(snapshot,target)
    specs=m.table_specs(m.load_catalog());fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f,contextlib.closing(m.connect(target)) as db:
        f.write('PRAGMA defer_foreign_keys=ON;\n')
        f.write(m.SCHEMA.read_text().replace('PRAGMA foreign_keys=ON;',''))
        for t,spec in specs.items():
            cols=[c['column_name'] for c in spec['columns'] if c['is_generated']=='NEVER']
            for row in db.execute('SELECT '+','.join(map(m.ident,cols))+' FROM '+m.ident(t)):
                f.write('INSERT INTO '+m.ident(t)+' ('+','.join(map(m.ident,cols))+') VALUES ('+','.join(literal(v) for v in row)+');\n')
        f.write('PRAGMA foreign_key_check;\n')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--snapshot',required=True);p.add_argument('--target',required=True);p.add_argument('--output',required=True);a=p.parse_args();generate(a.snapshot,a.target,a.output)
    print('Validated private SQL import created')
