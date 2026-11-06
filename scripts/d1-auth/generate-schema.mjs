import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { rehearsalOptions } from './rehearsal.mjs';
const db=new DatabaseSync(':memory:');
try {
 const migration=await getMigrations(rehearsalOptions(db,randomBytes(32).toString('hex')));
 const sql=await migration.compileMigrations();
 writeFileSync(new URL('../../workers/auth-preview/schema.sql',import.meta.url),'-- Generated from pinned Better Auth options; synthetic isolated DB only.\n'+sql+'\n-- Explicit sandbox marker; this configuration refuses real accounts.\nCREATE TABLE \"_auth_preview_manifest\" (id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL CHECK(mode=\'synthetic-only-v1\'));\nINSERT INTO \"_auth_preview_manifest\" VALUES(1,\'synthetic-only-v1\');\n',{flag:'wx'});
 console.log('Synthetic Auth schema generated; no remote changes.');
} finally {db.close();}
