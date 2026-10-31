import { PGlite } from '@electric-sql/pglite';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect,it } from 'vitest';
const reader='d1_migration_reader_20261022';
const uuid=(n:number)=>`00000000-0000-4000-8000-${n.toString().padStart(12,'0')}`;
const fixture={columns:[{table_name:'items',column_name:'id'},{table_name:'metrics',column_name:'day'},{table_name:'metrics',column_name:'channel'}],constraints:[{table_name:'items',type:'p',definition:'PRIMARY KEY (id)'},{table_name:'metrics',type:'p',definition:'PRIMARY KEY (day, channel)'}]};
const proposal=()=>execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/d1');import change_capture;print(change_capture.generate(json.load(sys.stdin)))"],{input:JSON.stringify(fixture),encoding:'utf8'});
async function database(){const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;REVOKE CREATE ON SCHEMA public FROM PUBLIC;CREATE ROLE ${reader} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS VALID UNTIL '2026-11-05 10:00:00+00';ALTER ROLE ${reader} SET default_transaction_read_only=on;CREATE TABLE items(id uuid PRIMARY KEY,body text);CREATE TABLE metrics(day date,channel text,visits integer NOT NULL DEFAULT 0,PRIMARY KEY(day,channel));GRANT USAGE ON SCHEMA public TO authenticated,${reader};GRANT SELECT ON items,metrics TO ${reader};GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON items,metrics TO authenticated;INSERT INTO items VALUES('${uuid(1)}','PRIVATE_BODY_BEFORE');`);return db;}
const approved=(sql:string)=>sql.replaceAll('__APPROVE_D1_CHANGE_CAPTURE_20261031__','approved-d1-change-capture-v1');
it('requires explicit approval, checks the exact source keys, and leaves existing rows untouched',async()=>{
 const db=await database();try{
  const sql=proposal();await expect(db.exec(sql)).rejects.toThrow('Review-only change capture');await db.exec('ROLLBACK');
  expect((await db.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname='d1_migration'")).rows[0]).toEqual({count:0});
  await db.exec('ALTER TABLE metrics DROP CONSTRAINT metrics_pkey;ALTER TABLE metrics ADD PRIMARY KEY(channel)');
  await expect(db.exec(approved(sql))).rejects.toThrow('inventory changed');await db.exec('ROLLBACK');
  await db.exec('ALTER TABLE metrics DROP CONSTRAINT metrics_pkey;ALTER TABLE metrics ADD PRIMARY KEY(day,channel)');
  const before=(await db.query(`SELECT rolconfig,rolvaliduntil FROM pg_roles WHERE rolname='${reader}'`)).rows;
  await db.exec(approved(sql));expect((await db.query(`SELECT rolconfig,rolvaliduntil FROM pg_roles WHERE rolname='${reader}'`)).rows).toEqual(before);
  expect((await db.query('SELECT * FROM items')).rows).toEqual([{id:uuid(1),body:'PRIVATE_BODY_BEFORE'}]);
  expect((await db.query('SELECT count(*)::int AS count FROM d1_migration.outbox')).rows[0]).toEqual({count:0});
  await expect(db.exec(approved(sql))).rejects.toThrow('Existing migration schema');await db.exec('ROLLBACK');
 }finally{await db.close();}
});
it('captures keys only, composite-key changes, truncation and rollback without changing app privileges',async()=>{
 const db=await database();try{
  await db.exec(approved(proposal()));await db.exec(`SET ROLE authenticated;INSERT INTO items VALUES('${uuid(2)}','PRIVATE_BODY');UPDATE items SET body='PRIVATE_CHANGED' WHERE id='${uuid(2)}';UPDATE items SET body=body WHERE id='${uuid(2)}';UPDATE items SET id='${uuid(3)}' WHERE id='${uuid(2)}';DELETE FROM items WHERE id='${uuid(3)}';INSERT INTO metrics VALUES('2026-10-31','old',1);UPDATE metrics SET channel='new';TRUNCATE metrics;RESET ROLE;`);
  const events=(await db.query<{table_name:string;operation:string;key:unknown}>('SELECT table_name,operation,key FROM d1_migration.outbox ORDER BY id')).rows;
  expect(events.map(row=>row.operation)).toEqual(['upsert','upsert','delete','upsert','delete','upsert','delete','upsert','truncate']);
  expect(JSON.stringify(events)).not.toContain('PRIVATE');expect(events[5].key).toEqual({day:'2026-10-31',channel:'old'});expect(events[8].key).toEqual({});
  await db.exec(`BEGIN;SET LOCAL ROLE authenticated;INSERT INTO items VALUES('${uuid(4)}','ROLLBACK');ROLLBACK;`);
  expect((await db.query('SELECT count(*)::int AS count FROM d1_migration.outbox')).rows[0]).toEqual({count:9});
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('SET ROLE '+role);await expect(db.query('SELECT * FROM d1_migration.outbox')).rejects.toThrow('permission denied');await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE '+reader);expect((await db.query('SELECT id FROM d1_migration.outbox')).rows).toHaveLength(9);
  await expect(db.exec(`UPDATE items SET body='FORBIDDEN'`)).rejects.toThrow('permission denied');
  await expect(db.exec('DELETE FROM d1_migration.outbox')).rejects.toThrow('permission denied');
  await expect(db.query('SELECT d1_migration.capture_row()')).rejects.toThrow('permission denied');
  await db.exec('CREATE TEMP TABLE attempt(id integer)');await expect(db.exec('CREATE TRIGGER attach AFTER INSERT ON attempt FOR EACH ROW EXECUTE FUNCTION d1_migration.capture_row()')).rejects.toThrow('permission denied');
 }finally{await db.close();}
});
it('acknowledges only bounded existing IDs, retains receipts, and keeps late lower IDs pending',async()=>{
 const db=await database();try{
  await db.exec(approved(proposal()));await db.exec(`INSERT INTO items VALUES('${uuid(2)}','one')`);
  await db.exec(`BEGIN;INSERT INTO items VALUES('${uuid(3)}','rolled back');ROLLBACK;`);
  await db.exec(`INSERT INTO items VALUES('${uuid(4)}','three')`);
  await db.exec('SET ROLE '+reader);
  const metadataSql=execFileSync('python3',['-c',"import sys;sys.path.insert(0,'scripts/d1');import migrate;print(migrate.capture_metadata_sql({'kind':'meta'}))"],{encoding:'utf8'});
  const metadata=(await db.query<{snapshot:string}>('SELECT '+metadataSql+' AS snapshot')).rows[0].snapshot;
  expect(JSON.parse(metadata).change_capture).toEqual({ids:['1','3'],protocol:1,bootstrap:true});
  for(const ids of [[],[1,1],[999],Array.from({length:501},(_,n)=>n+1)])await expect(db.query('SELECT d1_migration.acknowledge($1::bigint[],$2)',[ids,'a'.repeat(64)])).rejects.toThrow();
  await expect(db.query('SELECT d1_migration.acknowledge(ARRAY[1]::bigint[],$1)',['invalid'])).rejects.toThrow('Invalid bounded');
  expect((await db.query('SELECT d1_migration.acknowledge(ARRAY[1,3]::bigint[],$1) AS count',['a'.repeat(64)])).rows[0]).toEqual({count:2});
  expect((await db.query('SELECT d1_migration.acknowledge(ARRAY[1,3]::bigint[],$1) AS count',['b'.repeat(64)])).rows[0]).toEqual({count:0});
  expect((await db.query('SELECT DISTINCT destination_sha256 FROM d1_migration.outbox')).rows).toEqual([{destination_sha256:'a'.repeat(64)}]);
  await db.exec(`RESET ROLE;INSERT INTO d1_migration.outbox(id,table_name,operation,key) OVERRIDING SYSTEM VALUE VALUES(2,'items','upsert','{"id":"${uuid(1)}"}'::jsonb);SET ROLE ${reader};`);
  expect((await db.query('SELECT id::text AS id FROM d1_migration.outbox WHERE acknowledged_at IS NULL ORDER BY id')).rows).toEqual([{id:'2'}]);
 }finally{await db.close();}
});
it('preserves source RLS and detaches without deleting queued data or customer rows',async()=>{
 const db=await database();try{
  await db.exec("ALTER TABLE items ENABLE ROW LEVEL SECURITY;GRANT SELECT ON items TO anon;CREATE POLICY items_app ON items FOR ALL TO authenticated USING(body<>'FORBIDDEN') WITH CHECK(body<>'FORBIDDEN');");
  const policies=(await db.query("SELECT policyname,qual,with_check FROM pg_policies WHERE tablename='items'")).rows;
  await db.exec(approved(proposal()));await db.exec('SET ROLE authenticated');
  await expect(db.exec(`INSERT INTO items VALUES('${uuid(8)}','FORBIDDEN')`)).rejects.toThrow('row-level security');
  const start=performance.now();await db.exec("INSERT INTO items SELECT gen_random_uuid(),repeat('PRIVATE_ROW_BODY',500) FROM generate_series(1,500)");const elapsed=performance.now()-start;
  await db.exec('RESET ROLE');
  const size=(await db.query<{events:number;bytes:number}>("SELECT count(*)::int AS events,sum(pg_column_size(o))::int AS bytes FROM d1_migration.outbox o")).rows[0];expect(size.events).toBe(500);expect(size.bytes).toBeLessThan(256000);
  expect((await db.query("SELECT count(*)::int AS count FROM d1_migration.outbox WHERE key::text LIKE '%PRIVATE%'")).rows[0]).toEqual({count:0});
  expect((await db.query("SELECT policyname,qual,with_check FROM pg_policies WHERE tablename='items'")).rows).toEqual(policies);
  await db.exec('SET ROLE anon');expect((await db.query('SELECT id FROM items')).rows).toEqual([]);await db.exec('RESET ROLE');
  const detach=execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/d1');import change_capture;print(change_capture.detach(json.load(sys.stdin)))"],{input:JSON.stringify(fixture),encoding:'utf8'});
  await db.exec(detach);await db.exec(`SET ROLE authenticated;INSERT INTO items VALUES('${uuid(9)}','after-detach');RESET ROLE`);
  expect((await db.query('SELECT count(*)::int AS count FROM d1_migration.outbox')).rows[0]).toEqual({count:500});expect((await db.query('SELECT count(*)::int AS count FROM items')).rows[0]).toEqual({count:502});
  await db.exec('SET ROLE '+reader);await expect(db.query('SELECT * FROM d1_migration.outbox')).rejects.toThrow('permission denied');expect((await db.query('SELECT id FROM items')).rows).toHaveLength(502);
  writeFileSync('.d1-private/change-capture-fixture-report-20261031.json',JSON.stringify({fixtureOnly:true,sourceRowsInserted:500,events:size.events,metadataBytes:size.bytes,fixtureInsertMs:Math.round(elapsed),customerRowsRetained:true,sourceRlsPreserved:true,detachPreservesQueue:true,productionApplied:false},null,2),{mode:0o600});
 }finally{await db.close();}
});
