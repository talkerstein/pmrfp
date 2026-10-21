import { afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDb } from './harness';
let db: PGlite;
afterAll(async()=>{await db?.close();});
it('reconciles the older major-project migration over an already-installed wave-2 view without shrinking it',async()=>{
  const base='20261012000001_major_projects.sql';
  db=await createTestDb([base,'20261012000003_major_projects_wave2.sql']);
  await db.query(`insert into major_projects (slug,source,source_key,name,status,source_updated,license) values ('replay-test','manual','replay-test','Keep this project','application','2026-10-20','test')`);
  const columns=()=>db.query("select column_name from information_schema.columns where table_schema='public' and table_name='major_projects_public' order by ordinal_position");
  const before=(await columns()).rows;
  await db.exec(readFileSync(join(process.cwd(),'supabase/migrations',base),'utf8'));
  expect((await columns()).rows).toEqual(before);
  expect((await db.query("select name,status,source_updated::text from major_projects where slug='replay-test'")).rows).toEqual([{name:'Keep this project',status:'application',source_updated:'2026-10-20'}]);
});
