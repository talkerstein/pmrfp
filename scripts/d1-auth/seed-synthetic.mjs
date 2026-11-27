import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRehearsal, importSyntheticFixtures } from './rehearsal.mjs';
import { hash } from 'bcryptjs';
const root=new URL('../../.d1-private/',import.meta.url);
const credentials={GATEWAY_SECRET:randomBytes(32).toString('hex'),AUTH_SECRET:randomBytes(32).toString('hex')};
const password=randomBytes(24).toString('base64url');
const passwordHash=await hash(password,10);
const records=[11,12,13,14].map(n=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,email:`migration-${n}@example.invalid`,encrypted_password:passwordHash,email_confirmed_at:n===12?null:'2026-11-01T00:00:00Z',created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',banned_until:n===13?'2099-01-01T00:00:00Z':n===14?'2020-01-01T00:00:00Z':null}));
const db=new DatabaseSync(':memory:');
try {
 await createRehearsal(db,credentials.AUTH_SECRET);importSyntheticFixtures(db,records);
 const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
 const statements=['BEGIN;'];
 for(const table of ['user','account'])for(const row of db.prepare(`SELECT * FROM "${table}"`).all()){
  statements.push(`INSERT INTO "${table}" (${Object.keys(row).map(k=>'"'+k+'"').join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`);
 }
 statements.push('COMMIT;');
 writeFileSync(new URL('auth-synthetic-seed-20261105.sql',root),statements.join('\n'),{mode:0o600,flag:'wx'});
 writeFileSync(new URL('auth-preview-secrets-20261105.json',root),JSON.stringify(credentials),{mode:0o600,flag:'wx'});
 writeFileSync(new URL('auth-preview-fixtures-20261105.json',root),JSON.stringify({password,accounts:records.map(({id,email})=>({id,email})),bcryptCost:10}),{mode:0o600,flag:'wx'});
 console.log('Four synthetic-only cost-10 fixtures prepared privately; no real accounts read.');
}finally{db.close();}
