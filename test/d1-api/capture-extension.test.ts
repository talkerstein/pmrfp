import {PGlite} from '@electric-sql/pglite';
import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';
const reader='d1_migration_reader_20261022';
const before={columns:[{table_name:'items',column_name:'id'}],constraints:[{table_name:'items',type:'p',definition:'PRIMARY KEY (id)'}]};
const after={columns:[...before.columns,{table_name:'new_items',column_name:'id'}],constraints:[...before.constraints,{table_name:'new_items',type:'p',definition:'PRIMARY KEY (id)'}]};
const python=(code:string,input:unknown)=>execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/d1');import change_capture as c;c.EXPIRY='2099-11-12 10:00:00+00';"+code],{input:JSON.stringify(input),encoding:'utf8'});
const proposal=(approved=true)=>python('import extend_capture as e;d=json.load(sys.stdin);print(e.generate(d["before"],d["after"]))',{before,after}).replaceAll('__APPROVE_CAPTURE_EXTENSION_20261105__',approved?'approved-capture-extension-v1':'__APPROVE_CAPTURE_EXTENSION_20261105__');
async function fixture(){const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;REVOKE CREATE ON SCHEMA public FROM PUBLIC;CREATE ROLE ${reader} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS CONNECTION LIMIT 3 VALID UNTIL '2099-11-12 10:00:00+00';CREATE TABLE items(id integer PRIMARY KEY,body text);GRANT SELECT ON items TO ${reader};`);await db.exec(python('print(c.generate(json.load(sys.stdin)))',before).replaceAll('__APPROVE_D1_CHANGE_CAPTURE_20261031__','approved-d1-change-capture-v1'));await db.exec("CREATE TABLE new_items(id integer PRIMARY KEY,body text);ALTER TABLE new_items ENABLE ROW LEVEL SECURITY;INSERT INTO new_items VALUES(1,'PRESERVE_ME');");return db;}
it('preserves historical rows and RLS while adding SELECT and key-only capture',async()=>{
 const db=await fixture();try{
  await expect(db.exec(proposal(false))).rejects.toThrow('requires approval');await db.exec('ROLLBACK');
  await db.exec(proposal());expect((await db.query('SELECT * FROM new_items')).rows).toEqual([{id:1,body:'PRESERVE_ME'}]);
  expect((await db.query('SELECT count(*)::int AS count FROM d1_migration.outbox')).rows[0]).toEqual({count:0});
  await db.exec("INSERT INTO new_items VALUES(2,'PRIVATE_BODY');UPDATE new_items SET body='UPDATED' WHERE id=2;DELETE FROM new_items WHERE id=2");
  const events=(await db.query('SELECT table_name,operation,key FROM d1_migration.outbox ORDER BY id')).rows;
  expect(events).toEqual([{table_name:'new_items',operation:'upsert',key:{id:2}},{table_name:'new_items',operation:'upsert',key:{id:2}},{table_name:'new_items',operation:'delete',key:{id:2}}]);
  expect(JSON.stringify(events)).not.toContain('PRIVATE');await db.exec('SET ROLE '+reader);expect((await db.query('SELECT body FROM new_items')).rows).toEqual([{body:'PRESERVE_ME'}]);
  await expect(db.exec("UPDATE new_items SET body='DENIED'")).rejects.toThrow('permission denied');await db.exec('RESET ROLE;SET ROLE authenticated');await expect(db.query('SELECT * FROM new_items')).rejects.toThrow('permission denied');await db.exec('RESET ROLE');await expect(db.exec(proposal())).rejects.toThrow('Registered baseline changed');await db.exec('ROLLBACK');
 }finally{await db.close();}
});
it('refuses unknown keys, absent RLS and repeat installation',async()=>{
 const db=await fixture();try{
  await db.exec('ALTER TABLE new_items DISABLE ROW LEVEL SECURITY');await expect(db.exec(proposal())).rejects.toThrow('lacks RLS');await db.exec('ROLLBACK');
  await db.exec('ALTER TABLE new_items ENABLE ROW LEVEL SECURITY;ALTER TABLE new_items ADD COLUMN other integer NOT NULL DEFAULT 1;ALTER TABLE new_items DROP CONSTRAINT new_items_pkey;ALTER TABLE new_items ADD PRIMARY KEY(id,other)');
  await expect(db.exec(proposal())).rejects.toThrow('key inventory changed');await db.exec('ROLLBACK');
 }finally{await db.close();}
});
