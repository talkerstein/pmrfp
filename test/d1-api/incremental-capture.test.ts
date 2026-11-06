import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';
const reader='d1_migration_reader_20261022';
const uuid=(n:number)=>`00000000-0000-4000-8000-${n.toString().padStart(12,'0')}`;
const emptyDigest='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const python=(code:string,input:unknown)=>execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/d1');import change_capture;change_capture.EXPIRY='2099-11-05 10:00:00+00';"+code],{input:JSON.stringify(input),encoding:'utf8'});
async function fixture(){
 const db=new PGlite({extensions:{pg_trgm}});await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;REVOKE CREATE ON SCHEMA public FROM PUBLIC;
 CREATE ROLE ${reader} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS VALID UNTIL '2099-11-05 10:00:00+00';
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${uuid(1)}');
 CREATE VIEW d1_migration_auth_ids_20261022 AS SELECT id FROM auth.users;
 CREATE TABLE items(id uuid PRIMARY KEY,body text,amount numeric,metadata jsonb,active boolean DEFAULT true);
 CREATE TABLE metrics(day date,channel text,visits numeric NOT NULL DEFAULT 0,PRIMARY KEY(day,channel));
 GRANT USAGE ON SCHEMA public TO ${reader};GRANT SELECT ON items,metrics,d1_migration_auth_ids_20261022 TO ${reader};
 INSERT INTO items VALUES('${uuid(1)}','BEFORE',1234567890123456789.123456789,'{"precise":1234567890123456789.123456789}',true);`);
 const catalog={columns:(await db.query("SELECT table_name,column_name,udt_name,is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('items','metrics') ORDER BY table_name,ordinal_position")).rows,constraints:(await db.query("SELECT t.relname AS table_name,c.contype AS type,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype='p' ORDER BY t.relname")).rows};
 const proposal=python('import change_capture;print(change_capture.generate(json.load(sys.stdin)))',catalog).replace('__APPROVE_D1_CHANGE_CAPTURE_20261031__','approved-d1-change-capture-v1');await db.exec(proposal);
 return {db,catalog};
}
function sql(catalog:unknown,digest=emptyDigest,full=false){
 return python("import incremental_capture as i,migrate as m;d=json.load(sys.stdin);s={'id':1,'protocol':1,'source_sha256':'a'*64,'candidate_sha256':'b'*64,'catalog_sha256':m.digest(m.CATALOG.read_bytes()),'receipt_digest':d['digest']};print(i.source_sql(d['catalog'],s,d['full']))",{catalog,digest,full}).replaceAll('\\g /dev/null',';');
}
async function packets(db:PGlite,query:string){
 const results=await db.exec(query);return results.flatMap(r=>r.rows).flatMap(row=>Object.values(row as Record<string,unknown>).filter((v):v is string=>typeof v==='string'&&v.startsWith('{')).map(v=>({raw:v,value:JSON.parse(v)})));
}
it('reads only coalesced current keys, preserves deletes and truncation, refreshes Auth IDs and checks against the same full source',async()=>{
 const {db,catalog}=await fixture();try{
  await db.exec(`UPDATE items SET body='AFTER';INSERT INTO items(id,body) VALUES('${uuid(2)}','DELETE_ME');UPDATE items SET id='${uuid(3)}' WHERE id='${uuid(2)}';DELETE FROM items WHERE id='${uuid(3)}';
  INSERT INTO metrics VALUES('2026-11-01','old',1);UPDATE metrics SET channel='new';TRUNCATE metrics;INSERT INTO metrics VALUES('2026-11-02','final',9999999999999999.123456789);
  INSERT INTO auth.users VALUES('${uuid(2)}');`);
  await db.exec(`BEGIN;INSERT INTO items(id,body) VALUES('${uuid(4)}','ROLLBACK');ROLLBACK;`);await db.exec(`SET ROLE ${reader};`);
  const out=await packets(db,sql(catalog,emptyDigest,true));const header=out.find(r=>r.value.kind==='capture-meta')!.value;
  expect(header.replaced_tables).toEqual(['_auth_users','metrics']);expect(header.ids.every((id:unknown)=>typeof id==='string')).toBe(true);
  const keyed=out.filter(r=>r.value.table==='items'&&!r.value.full_check).map(r=>r.value);
  expect(keyed).toHaveLength(3);expect(keyed.find(r=>r.key[0]===uuid(1)).row).toMatchObject({body:'AFTER',amount:'1234567890123456789.123456789',active:true});
  expect(keyed.filter(r=>r.row===null).map(r=>r.key[0]).sort()).toEqual([uuid(2),uuid(3)]);
  expect(out.find(r=>r.value.table==='items'&&r.value.key?.[0]===uuid(1))!.raw).toContain('1234567890123456789.123456789');
  expect(out.filter(r=>r.value.table==='metrics'&&!r.value.full_check).map(r=>r.value)).toEqual([{table:'metrics',replacement:true,row:{day:'2026-11-02',channel:'final',visits:'9999999999999999.123456789'}}]);
  expect(out.filter(r=>r.value.table==='_auth_users'&&!r.value.full_check)).toHaveLength(2);
  expect(out.filter(r=>r.value.full_check)).toHaveLength(4);expect(JSON.stringify(out)).not.toMatch(/DELETE_ME|ROLLBACK/);
 }finally{await db.close();}
});
it('refuses disabled capture triggers or column drift before exporting rows',async()=>{
 const {db,catalog}=await fixture();try{
  await db.exec(`ALTER TABLE items DISABLE TRIGGER d1_migration_capture;SET ROLE ${reader}`);await expect(packets(db,sql(catalog))).rejects.toThrow('division by zero');await db.exec(`ROLLBACK;RESET ROLE;ALTER TABLE items ENABLE TRIGGER d1_migration_capture;ALTER TABLE items ADD COLUMN unexpected text;SET ROLE ${reader}`);
  await expect(packets(db,sql(catalog))).rejects.toThrow('division by zero');await db.exec('ROLLBACK');
 }finally{await db.close();}
});
it('rejects rewound acknowledged receipt history and includes late lower IDs without a watermark',async()=>{
 const {db,catalog}=await fixture();try{
  await db.exec("UPDATE items SET body='one'");await db.exec("BEGIN;UPDATE items SET body='rollback';ROLLBACK");
  await db.exec(`UPDATE items SET body='three';SET ROLE ${reader};SELECT d1_migration.acknowledge(ARRAY[1,3]::bigint[],'${'b'.repeat(64)}');RESET ROLE;`);
  await db.exec(`SET ROLE ${reader}`);await expect(packets(db,sql(catalog))).rejects.toThrow('division by zero');await db.exec('ROLLBACK;RESET ROLE');
  const expression=python('import capture_state;print(capture_state.DIGEST_EXPRESSION)',null);
  const digest=(await db.query<{digest:string}>('SELECT '+expression+' AS digest FROM d1_migration.outbox WHERE acknowledged_at IS NOT NULL')).rows[0].digest;
  await db.exec(`INSERT INTO d1_migration.outbox(id,table_name,operation,key) OVERRIDING SYSTEM VALUE VALUES(2,'items','upsert','{"id":"${uuid(1)}"}');SET ROLE ${reader}`);
  const out=await packets(db,sql(catalog,digest));expect(out.find(r=>r.value.kind==='capture-meta')!.value.ids).toEqual(['2']);
  expect(out.find(r=>r.value.table==='items')!.value.row.body).toBe('three');
 }finally{await db.close();}
});
it('uses serializable bounded acknowledgements and refuses receipts owned by another dataset',async()=>{
 const {db,catalog}=await fixture();try{
  await db.exec(`UPDATE items SET body='changed';SET ROLE ${reader}`);
  const ack=(dataset:string)=>python('import acknowledge_capture;d=json.load(sys.stdin);print(acknowledge_capture.acknowledgement_sql(d["ids"],d["dataset"],d["catalog"]))',{ids:['1'],dataset,catalog});
  await db.exec(ack('a'.repeat(64)));
  await expect(db.exec(ack('b'.repeat(64)))).rejects.toThrow('Receipt belongs to another checkpoint');await db.exec('ROLLBACK');
  expect((await db.query('SELECT destination_sha256 FROM d1_migration.outbox')).rows).toEqual([{destination_sha256:'a'.repeat(64)}]);
 }finally{await db.close();}
});
it('matches the audit exclusion for extension functions while rejecting actual app-function drift',async()=>{
 const {db,catalog}=await fixture();try{
  const audited={...catalog,functions:[]};await db.exec(`CREATE EXTENSION pg_trgm;SET ROLE ${reader}`);
  expect((await packets(db,sql(audited))).some(row=>row.value.kind==='capture-meta')).toBe(true);
  await db.exec("RESET ROLE;CREATE FUNCTION public.actual_app_change() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;");await db.exec(`SET ROLE ${reader}`);
  await expect(packets(db,sql(audited))).rejects.toThrow('division by zero');await db.exec('ROLLBACK');
 }finally{await db.close();}
});
it('refuses a replaced private definer before calling it or exporting source rows',async()=>{
 const {db,catalog}=await fixture();try{
  await db.exec("CREATE OR REPLACE FUNCTION d1_migration.acknowledge(p_ids bigint[],p_destination_sha256 text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN UPDATE public.items SET body='MUST_NOT_RUN';RETURN 0;END $$;");
  await db.exec(`SET ROLE ${reader}`);await expect(packets(db,sql(catalog))).rejects.toThrow('division by zero');await db.exec('ROLLBACK');
  const ack=python('import acknowledge_capture;d=json.load(sys.stdin);print(acknowledge_capture.acknowledgement_sql(["1"],"a"*64,d))',catalog);
  await expect(db.exec(ack)).rejects.toThrow('Reviewed private queue functions changed');await db.exec('ROLLBACK');
  expect((await db.query('SELECT body FROM items')).rows).toEqual([{body:'BEFORE'}]);
 }finally{await db.close();}
});
