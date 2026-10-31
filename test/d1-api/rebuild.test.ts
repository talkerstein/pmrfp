import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { rebuild, authoritativeHash } from '../../scripts/d1/rebuild.mjs';
import { scoreLedger } from '../../src/lib/karma/rules';

it('rebuilds approved fields while preserving ledgers, content, historical counters and unknown tables',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync('d1/0001-staging-copy.sql','utf8'));
    db.exec(`INSERT INTO _auth_users(id) VALUES('u');
      INSERT INTO users_profile(id,email) VALUES('u','synthetic@example.invalid');
      INSERT INTO organizations(id,name,slug) VALUES('o','Synthetic','synthetic');
      INSERT INTO karma_events(id,org_id,kind,points,source_type,source_id,created_at) VALUES('k','o','profile_approved',20,'test','test','2026-10-21T00:00:00Z');
      INSERT INTO org_karma(org_id,raw_points,score,level,decay) VALUES('o',999,999,5,'1');
      INSERT INTO forum_profiles(user_id,handle,display_name,reputation,post_count) VALUES('u','synthetic','Synthetic',100,100);
      INSERT INTO forum_categories(id,slug,name,thread_count) VALUES('c','synthetic','Synthetic',999);
      INSERT INTO forum_threads(id,short_id,category_id,author_id,type,title,slug,body,body_words,reply_count,view_count) VALUES('t','12345678','c','u','discussion','Synthetic thread','synthetic','Synthetic body with enough content to meet the real forum minimum length.',2,999,1234);
      INSERT INTO forum_posts(id,thread_id,author_id,body,body_words) VALUES('p','t','u','Synthetic reply',2);
      INSERT INTO forum_posts(id,thread_id,author_id,body,body_words,status) VALUES('hidden','t','u','Hidden reply',2,'hidden');
      CREATE TABLE newly_added_business_data(id TEXT PRIMARY KEY,payload TEXT); INSERT INTO newly_added_business_data VALUES('keep','unchanged');`);
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name));
    const before=authoritativeHash(db,tables), now='2026-10-22T00:00:00Z';
    const result=rebuild(db,now);
    expect(result.authoritativeSha256).toBe(before);
    const scored=scoreLedger([{kind:'profile_approved',points:20,createdAt:'2026-10-21T00:00:00Z'}],new Date(now));
    expect(db.prepare("SELECT raw_points,score,level FROM org_karma WHERE org_id='o'").get()).toEqual({raw_points:scored.raw,score:scored.score,level:scored.level});
    expect(db.prepare("SELECT reply_count,words_total,view_count FROM forum_threads WHERE id='t'").get()).toEqual({reply_count:1,words_total:4,view_count:1234});
    expect(db.prepare("SELECT post_count FROM forum_profiles WHERE user_id='u'").get()?.post_count).toBe(2);
    expect(db.prepare("SELECT thread_count,post_count FROM forum_categories WHERE id='c'").get()).toEqual({thread_count:1,post_count:2});
    expect(rebuild(db,now).authoritativeSha256).toBe(before);
    expect(authoritativeHash(db,tables)).toBe(before);
  } finally { db.close(); }
});
