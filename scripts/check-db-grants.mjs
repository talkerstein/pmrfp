// New public tables must declare their backend access in their own migration.
// Historical migrations also carry explicit grants so resets need no default ACLs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const directory = process.argv[2] ?? 'supabase/migrations';
const failures = [];
for (const file of readdirSync(directory).filter(f => f.endsWith('.sql'))) {
  const sql = readFileSync(join(directory,file),'utf8').replace(/--[^\n]*/g,'');
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)) {
    const table = match[1];
    const grants = [...sql.matchAll(new RegExp(`grant\\s+([^;]+?)\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+([^;]+);`,'gi'))];
    const operations = new Set(grants.filter(g=>g[2].split(',').map(r=>r.trim().toLowerCase()).includes('service_role')).flatMap(g=>g[1].toLowerCase().split(',').map(c=>c.trim())));
    if (!['select','insert','update','delete'].every(op=>operations.has(op) || operations.has('all') || operations.has('all privileges'))) failures.push(`${file}: public.${table} needs explicit service_role CRUD grants in the same migration`);
    if (!new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,'i').test(sql) && file !== '20260529000001_schema.sql') failures.push(`${file}: public.${table} needs explicit RLS enablement`);
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode=1; }
else console.log('Public table migrations declare explicit backend grants and RLS.');
