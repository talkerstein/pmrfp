"""Compare repository and point-in-time production metadata without reading rows."""
import argparse,json
from pathlib import Path
from schema import ROOT

def compare(repo,live,commit):
    a={(x['table_name'],x['column_name']):x for x in repo['columns']};b={(x['table_name'],x['column_name']):x for x in live['columns']}
    out={'master':commit,'audit_date':'2026-10-21','repo_tables':len({x[0] for x in a}),'production_tables':len({x[0] for x in b}),'repo_only_tables':sorted({x[0] for x in a}-{x[0] for x in b}),'production_only_tables':sorted({x[0] for x in b}-{x[0] for x in a}),'repo_only_columns':[list(k) for k in sorted(a.keys()-b.keys()) if k[0] in {x[0] for x in b}],'production_only_columns':[list(k) for k in sorted(b.keys()-a.keys())],'changed_columns':[]}
    for k in sorted(a.keys()&b.keys()):
        changes={f:{'repo':a[k][f],'production':b[k][f]} for f in ['udt_name','is_nullable','column_default','is_identity','is_generated','generation_expression'] if a[k][f]!=b[k][f]}
        if changes:out['changed_columns'].append({'table':k[0],'column':k[1],'changes':changes})
    for key,name in [('functions','name'),('views','viewname'),('policies','policyname')]:
        out[key]={'repo_only':sorted({x[name] for x in repo[key]}-{x[name] for x in live[key]}),'production_only':sorted({x[name] for x in live[key]}-{x[name] for x in repo[key]})}
    return out
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repo',default=str(ROOT/'d1/postgres-catalog.json'));p.add_argument('--production',default=str(ROOT/'d1/production-catalog-2026-10-21.json'));p.add_argument('--master',required=True);p.add_argument('--output',default=str(ROOT/'d1/schema-drift.json'));a=p.parse_args()
    result=compare(json.loads(Path(a.repo).read_text()),json.loads(Path(a.production).read_text()),a.master);Path(a.output).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'repo_tables':result['repo_tables'],'production_tables':result['production_tables'],'missing':len(result['repo_only_tables'])}))
