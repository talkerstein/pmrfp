import json,os,subprocess,sys,tempfile,uuid
from pathlib import Path
sys.path[:0]=['scripts/d1','test/d1']
from test_saved_rfp_rollback import SavedRfpRollbackTest
def synthetic(value):
    return str(uuid.uuid5(uuid.NAMESPACE_DNS,'pmrfp-rollback-fixture:'+value))
def sql(val):
    return "'" + val.replace("'","''") + "'"
cols=('id','user_id','organization_id','rfp_id','created_at')
def convert(row):
    return {c:synthetic(row[c]) if c!='created_at' and row[c] is not None else row[c] for c in cols}
def evt(raw):
    return sql(json.dumps(convert(json.loads(raw))))+'::jsonb' if raw else 'NULL'
def result(row):
    x=convert(dict(zip(cols,row)))
    return '('+','.join('NULL' if x[c] is None else sql(x[c]) for c in cols)+')'
test=SavedRfpRollbackTest()
new,events=test.fixture()
source_schema=Path('supabase/migrations/20260529000001_schema.sql').read_text()
start=source_schema.index('create table public.saved_rfps (')
table=source_schema[start:source_schema.index('\n);',start)+3]
data=list(new.execute('SELECT * FROM saved_rfps ORDER BY id'))
test.doCleanups()
schema=Path('d1/saved-rfp-postgres-rollback-rehearsal.sql').read_text()
with tempfile.TemporaryDirectory(prefix='pmrfp-pg-rollback-') as tmp:
    env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update(PGHOST=tmp,PGPORT='55449',PGDATABASE='pmrfp_rollback_rehearsal',PGUSER='rollback_rehearsal')
    def run(args,**kw):
        return subprocess.run(args,env=env,check=True,**kw)
    pg=Path(tmp)/'data'
    run(['initdb','-D',str(pg),'-U','rollback_rehearsal','-A','trust','--no-locale'],stdout=subprocess.DEVNULL)
    run(['pg_ctl','-D',str(pg),'-l',str(Path(tmp)/'postgres.log'),'-o',f"-h '' -k {tmp} -p 55449",'-w','start'],stdout=subprocess.DEVNULL)
    try:
        run(['createdb','pmrfp_rollback_rehearsal'],stdout=subprocess.DEVNULL)
        setup='\n'.join('CREATE TABLE public.'+t+'(id uuid primary key); INSERT INTO public.'+t+' VALUES '+','.join('('+sql(synthetic(v))+')' for v in vs)+';' for t,vs in [('users_profile',['a','b']),('organizations',['org']),('rfp_posts',['rfp1','rfp2'])])
        commands=[setup,table,"INSERT INTO public.saved_rfps VALUES "+result(('old','a','org','rfp1','2026-11-09T00:00:00Z'))+';',
          'CREATE TEMP TABLE saved_rfp_rehearsal_events(sequence bigint primary key,before_row jsonb,after_row jsonb);',
          'CREATE TEMP TABLE saved_rfp_rehearsal_expected (LIKE public.saved_rfps);',
          'INSERT INTO saved_rfp_rehearsal_events VALUES '+','.join(f'({seq},{evt(before)},{evt(after)})' for seq,before,after in events)+';',
          'INSERT INTO saved_rfp_rehearsal_expected VALUES '+','.join(map(result,data))+';',
          schema, "BEGIN; SELECT pg_temp.replay_saved_rfps(4); ROLLBACK;",
          "DO $$ BEGIN BEGIN PERFORM pg_temp.replay_saved_rfps(5); RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Incomplete saved-list journal' THEN RAISE; END IF; END; IF (SELECT COUNT(*) FROM public.saved_rfps)<>1 THEN RAISE EXCEPTION 'partial replay'; END IF; END $$;",
          "BEGIN; UPDATE public.saved_rfps SET organization_id=NULL; DO $$ BEGIN BEGIN PERFORM pg_temp.replay_saved_rfps(4); RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Frozen saved-list row differs from journal baseline' THEN RAISE; END IF; END; IF (SELECT COUNT(*) FROM public.saved_rfps)<>1 THEN RAISE EXCEPTION 'partial replay'; END IF; END $$; ROLLBACK;",
          "BEGIN; DELETE FROM pg_temp.saved_rfp_rehearsal_expected WHERE organization_id IS NULL; DO $$ BEGIN BEGIN PERFORM pg_temp.replay_saved_rfps(4); RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Saved-list rows do not match the frozen D1 readback' THEN RAISE; END IF; END; IF (SELECT COUNT(*) FROM public.saved_rfps)<>1 THEN RAISE EXCEPTION 'partial replay'; END IF; END $$; ROLLBACK;",
          "SELECT pg_temp.replay_saved_rfps(4);"]
        r=run(['psql','-X','-v','ON_ERROR_STOP=1','-qAt'],input='\n'.join(commands),text=True,capture_output=True)
        assert r.stdout.splitlines()==['4','4']
    except subprocess.CalledProcessError as e:
        print(e.stderr)
        raise
    finally:
        run(['pg_ctl','-D',str(pg),'-m','fast','-w','stop'],stdout=subprocess.DEVNULL)
print(json.dumps(dict(postgresReplayVerified=True,exactFinalRows=True,conflictsAndGapsRollback=True,finalComparisonGuardsCommit=True,productionChanged=False)))
