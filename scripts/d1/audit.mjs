/** Source dependency inventory, containing paths and identifiers only. */
import { readFile,readdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='node_modules'||e.name.startsWith('.'))continue;const p=join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(/\.(tsx?|mjs|py)$/.test(p))out.push(p);}return out;}
const inventory={tables:{},rpcs:{},storage:[],auth:[],realtime:[],dynamicTables:[],crons:JSON.parse(await readFile('vercel.json','utf8')).crons};
for(const file of [...await walk('src'),...await walk('mobile/src'),...await walk('scripts')]){
 if(file.startsWith('scripts/d1'))continue;
 const text=await readFile(file,'utf8');const lines=text.split('\n');
 for(let i=0;i<lines.length;i++){
  const line=lines[i],ref=`${file}:${i+1}`;
  for(const m of line.matchAll(/\.from\(\s*["'`]([\w-]+)["'`]\s*\)/g))(inventory.tables[m[1]]??=[]).push(ref);
  for(const m of line.matchAll(/\.rpc\(\s*["']([\w-]+)["']/g))(inventory.rpcs[m[1]]??=[]).push(ref);
  if(/storage\.(from|listBuckets|createBucket)/.test(line))inventory.storage.push(ref);
  if(/\.auth\./.test(line))inventory.auth.push(ref);
  if(/\.channel\(|postgres_changes|\.subscribe\(/.test(line))inventory.realtime.push(ref);
  if(/\.from\(\s*[A-Za-z_]/.test(line))inventory.dynamicTables.push(ref);
 }
}
await writeFile('d1/source-dependencies.json',JSON.stringify(inventory,null,2)+'\n');
console.log({relations:Object.keys(inventory.tables).length,rpcs:Object.keys(inventory.rpcs).length,crons:inventory.crons.length,authCallSites:inventory.auth.length,storageCallSites:inventory.storage.length});
