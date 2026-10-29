import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('keeps the test company non-public, gates private RFPs and revokes access on trial expiry',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT CASE current_user WHEN 'anon' THEN NULL::uuid ELSE 'aa1265f5-5298-4ec9-9292-93faa40a7272'::uuid END $$;
  CREATE TABLE users_profile(id uuid PRIMARY KEY,email text,primary_role text,status text);
  CREATE TABLE organizations(id uuid PRIMARY KEY,name text,slug text UNIQUE,organization_type text,profile_status text,status text,is_demo boolean,profile_indexable boolean,public_contact_visibility text);
  CREATE TABLE organization_members(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),user_id uuid REFERENCES users_profile(id),role text);
  CREATE TABLE trade_trials(organization_id uuid PRIMARY KEY REFERENCES organizations(id),started_by uuid,started_at timestamptz,ends_at timestamptz,source text,CHECK(ends_at>started_at AND ends_at<=started_at+interval '31 days'));
  CREATE TABLE subscriptions(organization_id uuid,status text,tier text);
  CREATE TABLE rfp_posts(id uuid PRIMARY KEY,status text,scope text,posted_by_user_id uuid,posted_by_organization_id uuid);
  INSERT INTO users_profile VALUES('aa1265f5-5298-4ec9-9292-93faa40a7272','d1-preview-20261022@example.invalid','trade','active');
  INSERT INTO rfp_posts VALUES('10000000-0000-4000-8000-000000000001','published','SYNTHETIC_PRIVATE_SCOPE',NULL,NULL);
  `);
  const catalog=JSON.parse(readFileSync('d1/production-catalog-2026-10-29.json','utf8'));
  for(const name of ['is_admin','is_org_member','has_active_trade_access'])await db.exec(catalog.functions.find((f:{name:string})=>f.name===name).definition);
  await db.exec(`ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;CREATE POLICY public_read ON organizations FOR SELECT TO anon,authenticated USING((profile_status='approved' AND status<>'suspended') OR is_org_member(auth.uid(),id) OR is_admin(auth.uid()));
  ALTER TABLE rfp_posts ENABLE ROW LEVEL SECURITY;CREATE POLICY private_read ON rfp_posts FOR SELECT TO authenticated USING((status='published' AND has_active_trade_access(auth.uid())) OR posted_by_user_id=auth.uid() OR is_org_member(auth.uid(),posted_by_organization_id) OR is_admin(auth.uid()));
  GRANT SELECT ON organizations,rfp_posts TO anon,authenticated;
  SET ROLE authenticated;`);
  expect((await db.query('SELECT scope FROM rfp_posts')).rows).toEqual([]);await db.exec('RESET ROLE');
  const sql=readFileSync('d1/temporary-trial-test-proposal-2026-10-29.sql','utf8');await expect(db.exec(sql)).rejects.toThrow('requires approval');await db.exec('ROLLBACK');
  await db.exec(sql.replaceAll('__APPROVE_TEMPORARY_TEST_TRIAL__','approved-local-fixture'));
  await db.exec('SET ROLE anon');expect((await db.query('SELECT id FROM organizations')).rows).toEqual([]);await db.exec('RESET ROLE;SET ROLE authenticated');
  expect((await db.query('SELECT scope FROM rfp_posts')).rows).toEqual([{scope:'SYNTHETIC_PRIVATE_SCOPE'}]);await db.exec('RESET ROLE');
  await db.exec("UPDATE trade_trials SET started_at=now()-interval '2 seconds',ends_at=now()-interval '1 second';SET ROLE authenticated");
  expect((await db.query('SELECT scope FROM rfp_posts')).rows).toEqual([]);
 }finally{await db.close();}
});
