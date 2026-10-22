/** Rebuild only approved derived data in a NEW local copy. Never opens a remote DB. */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { scoreLedger, isKarmaKind } from '../../src/lib/karma/rules.ts';

const policy=JSON.parse(readFileSync(new URL('../../d1/rebuild-policy.json',import.meta.url),'utf8'));
export function rebuild(db, now) {
  if(!Number.isFinite(new Date(now).getTime())) throw new Error('Invalid scoring timestamp');
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name));
  const applied=[];
  const present=(...names)=>names.every(n=>tables.has(n));
  const before=authoritativeHash(db,tables);
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  try {
    if(present('org_karma','karma_events','organizations')) {
      const events=db.prepare('SELECT id,org_id,kind,points,actor_id,created_at,reversed_at FROM karma_events ORDER BY created_at,id').all();
      if(events.some(e=>!isKarmaKind(e.kind)||!Number.isFinite(new Date(e.created_at).getTime()))) throw new Error('Unsupported or invalid karma ledger event; refusing partial rebuild');
      const grouped=new Map();
      for(const e of events) {
        const rows=grouped.get(e.org_id)??[];
        rows.push({id:e.id,kind:e.kind,points:e.points,actorId:e.actor_id,createdAt:e.created_at,reversedAt:e.reversed_at}); grouped.set(e.org_id,rows);
      }
      db.exec('DELETE FROM org_karma');
      const insert=db.prepare('INSERT INTO org_karma(org_id,raw_points,score,level,decay,last_earned_at,updated_at) VALUES(?,?,?,?,?,?,?)');
      for(const {id} of db.prepare('SELECT id FROM organizations ORDER BY id').all()) {
        const s=scoreLedger(grouped.get(id)??[],new Date(now));
        insert.run(id,s.raw,s.score,s.level,String(s.decay),s.lastEarnedAt,now);
      }
      applied.push('org_karma');
    }
    if(present('forum_threads','forum_posts','forum_categories','forum_profiles','forum_reputation_events','forum_thread_ratings')) {
      db.exec(`UPDATE forum_threads AS t SET
        reply_count=(SELECT count(*) FROM forum_posts p WHERE p.thread_id=t.id AND p.status='approved'),
        words_total=t.body_words+coalesce((SELECT sum(p.body_words) FROM forum_posts p WHERE p.thread_id=t.id AND p.status='approved'),0),
        last_post_at=coalesce((SELECT p.created_at FROM forum_posts p WHERE p.thread_id=t.id AND p.status='approved' ORDER BY julianday(p.created_at) DESC,p.id DESC LIMIT 1),t.created_at),
        last_post_user_id=coalesce((SELECT p.author_id FROM forum_posts p WHERE p.thread_id=t.id AND p.status='approved' ORDER BY julianday(p.created_at) DESC,p.id DESC LIMIT 1),t.author_id),
        rating_sum=coalesce((SELECT sum(r.score) FROM forum_thread_ratings r WHERE r.thread_id=t.id),0),
        rating_count=(SELECT count(*) FROM forum_thread_ratings r WHERE r.thread_id=t.id);
      UPDATE forum_categories AS c SET
        thread_count=(SELECT count(*) FROM forum_threads t WHERE t.category_id=c.id AND t.status='approved'),
        post_count=(SELECT count(*)+coalesce(sum(t.reply_count),0) FROM forum_threads t WHERE t.category_id=c.id AND t.status='approved'),
        last_post_at=(SELECT t.last_post_at FROM forum_threads t WHERE t.category_id=c.id AND t.status='approved' ORDER BY julianday(t.last_post_at) DESC,t.id DESC LIMIT 1),
        last_thread_id=(SELECT t.id FROM forum_threads t WHERE t.category_id=c.id AND t.status='approved' ORDER BY julianday(t.last_post_at) DESC,t.id DESC LIMIT 1);
      UPDATE forum_profiles AS f SET
        post_count=(SELECT count(*) FROM forum_threads t WHERE t.author_id=f.user_id AND t.status='approved')+(SELECT count(*) FROM forum_posts p WHERE p.author_id=f.user_id AND p.status='approved'),
        reputation=CASE WHEN f.is_system=1 THEN 0 ELSE coalesce((SELECT sum(e.points) FROM forum_reputation_events e WHERE e.user_id=f.user_id),0) END;`);
      applied.push('forum aggregates');
    }
    // Reset is restricted to the new candidate file, never the source or a running deployment.
    if(tables.has('rate_limit_hits')) { db.exec('DELETE FROM rate_limit_hits'); applied.push('rate_limit_hits'); }
    if(authoritativeHash(db,tables)!==before) throw new Error('Authoritative rows changed; rolled back');
    if(db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key violations; rolled back');
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
  return {policyVersion:policy.version,scoredAt:now,applied,authoritativeSha256:before,quickCheck:db.prepare('PRAGMA quick_check').get()};
}
export function authoritativeHash(db,tables) {
  const hash=createHash('sha256');
  for(const table of [...tables].sort()) {
    if(policy.rebuildTables.includes(table)||policy.resetTables.includes(table)) continue;
    const excluded=policy.rebuildColumns[table]??[];
    const quote=s=>'"'+s.replaceAll('"','""')+'"';
    const columns=db.prepare(`PRAGMA table_info(${quote(table)})`).all().map(c=>c.name).filter(c=>!excluded.includes(c));
    const rows=db.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`).all().map(r=>JSON.stringify(r)).sort();
    hash.update(JSON.stringify([table,columns,rows]));
  }
  return hash.digest('hex');
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  const [source,target,now]=process.argv.slice(2);
  if(!source||!target||!now||existsSync(target)||resolve(source)===resolve(target)) throw new Error('Usage: node scripts/d1/rebuild.mjs SOURCE.sqlite NEW_TARGET.sqlite SCORING_ISO_TIMESTAMP (target must not exist)');
  // Source must be a closed, validated migration file, not a live WAL database.
  if(existsSync(source+'-wal')) throw new Error('Refusing WAL source: first create a consistent migration backup');
  copyFileSync(source,target); chmodSync(target,0o600);
  const db=new DatabaseSync(target);
  let result;
  try { result=rebuild(db,now); } finally { db.close(); }
  result.sourceFileSha256=createHash('sha256').update(readFileSync(source)).digest('hex');
  result.candidateFileSha256=createHash('sha256').update(readFileSync(target)).digest('hex');
  result.policySha256=createHash('sha256').update(JSON.stringify(policy)).digest('hex');
  writeFileSync(target+'.rebuild.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
}
