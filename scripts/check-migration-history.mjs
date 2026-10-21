import { readFileSync } from 'node:fs';
const input = readFileSync(0,'utf8').replace(/\x1b\[[0-9;]*m/g,'').replaceAll('`','');
const rows = input.split('\n').map(line=>line.split('|').slice(0,2).map(s=>s.trim())).filter(([a,b])=>/^\d{14}$/.test(a ?? '') || /^\d{14}$/.test(b ?? ''));
if (!rows.length) throw new Error('No migration versions found; refusing to report synchronization.');
const unmatched = rows.filter(([local,remote])=>local!==remote);
if (unmatched.length) { console.error('Unmatched local/remote migrations:', JSON.stringify(unmatched)); process.exitCode=1; }
else console.log(`Verified ${rows.length} migration versions match production.`);
