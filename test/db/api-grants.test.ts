import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser } from "./harness";

// Full migration replay with NO blanket test grants or Supabase default ACLs.
// Auth/storage are platform shims; all public tables, policies and grants are real.
let db: PGlite;
const directory = join(process.cwd(), "supabase/migrations");
const patch = readFileSync(join(directory, "20261021000001_explicit_api_grants.sql"), "utf8");
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text,
      raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
  `);
  await db.exec(`
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','anon') $$;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,name text,bucket_id text,owner uuid,owner_id text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
  `);
  for (const file of readdirSync(directory).filter(f => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(directory, file), "utf8")
      .replace(/create index[^;]*using gin[^;]*;/gi, "")
      .replace(/^create extension[^\n]*/gmi, "");
    try { await db.exec(sql); } catch (error) { throw new Error(`Migration ${file} failed`, { cause: error }); }
  }
}, 30000);
afterAll(async () => { await db?.close(); });

async function permission(role: string, table: string, operation: string) {
  return (await db.query<{ok: boolean}>("select has_table_privilege($1,$2,$3) as ok", [role, `public.${table}`, operation])).rows[0].ok;
}

describe("October 30 explicit Data API permissions", () => {
  it("gives the backend all required table operations and view reads after a full reset", async () => {
    const missing = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','v') and
      (not has_table_privilege('service_role',c.oid,'SELECT') or
       (c.relkind='r' and (not has_table_privilege('service_role',c.oid,'INSERT') or
        not has_table_privilege('service_role',c.oid,'UPDATE') or not has_table_privilege('service_role',c.oid,'DELETE'))))`);
    expect(missing.rows).toEqual([]);
  });
  it("backs every client RLS command with a table or column grant", async () => {
    const missing = await db.query(`
      select c.relname, p.polname, r.rolname, op.privilege
      from pg_policy p join pg_class c on c.oid=p.polrelid
      join pg_namespace n on n.oid=c.relnamespace
      cross join pg_roles r
      cross join (values ('r','SELECT'),('a','INSERT'),('w','UPDATE'),('d','DELETE')) op(cmd,privilege)
      where n.nspname='public' and r.rolname in ('anon','authenticated')
        and (0=any(p.polroles) or r.oid=any(p.polroles))
        and (p.polcmd='*' or p.polcmd::text=op.cmd)
        and not case when op.privilege='DELETE' then has_table_privilege(r.oid,c.oid,op.privilege)
          else has_any_column_privilege(r.oid,c.oid,op.privilege) end
    `);
    expect(missing.rows).toEqual([]);
  });
  it("leaves all public tables protected by RLS", async () => {
    expect((await db.query("select tablename from pg_tables where schemaname='public' and not rowsecurity")).rows).toEqual([]);
  });
  it("keeps backend-only logs and Stripe deduplication inaccessible to clients", async () => {
    for (const table of ["lead_alert_log", "insight_brief_log", "insight_rejections", "stripe_webhook_events", "forum_reply_notifications"]) {
      for (const role of ["anon", "authenticated"]) {
        for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) expect(await permission(role,table,operation)).toBe(false);
      }
    }
  });
  it("keeps trial, intelligence and forum writes on the server", async () => {
    for (const table of ["trade_trials", "intel_access", "forum_threads", "forum_poll_votes", "organization_join_requests"]) {
      expect(await permission("authenticated",table,"SELECT")).toBe(true);
      for (const operation of ["INSERT", "UPDATE", "DELETE"]) expect(await permission("authenticated",table,operation)).toBe(false);
    }
  });
  it("preserves correction-request column restrictions after a repeated backfill", async () => {
    await db.exec(patch);
    expect(await permission("authenticated","correction_requests","UPDATE")).toBe(false);
    expect((await db.query<{ ok: boolean }>("select has_column_privilege('authenticated','public.correction_requests','status','UPDATE') as ok")).rows[0].ok).toBe(true);
    expect((await db.query<{ ok: boolean }>("select has_column_privilege('authenticated','public.correction_requests','details','UPDATE') as ok")).rows[0].ok).toBe(false);
    expect(await permission("anon","correction_requests","SELECT")).toBe(false);
  });
  it("allows anonymous teaser reads while withholding full RFP rows", async () => {
    expect(await asAnon(db, () => db.query("select id from public.rfp_public"))).toBeDefined();
    expect((await asAnon(db, () => db.query("select id from public.rfp_posts"))).rows).toEqual([]);
    await expect(asAnon(db, () => db.query("select scope from public.rfp_public"))).rejects.toThrow();
  });
  it("still filters member-only data for a signed-in user without access", async () => {
    const uid = "00000000-0000-4000-8000-000000000001";
    expect((await asUser(db,uid,()=>db.query("select * from public.trade_trials"))).rows).toEqual([]);
    expect((await asUser(db,uid,()=>db.query("select * from public.intel_access"))).rows).toEqual([]);
  });
  it("can patch an older installation without optional feature tables", async () => {
    const old = new PGlite();
    try {
      await old.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.rfp_posts(id uuid); alter table public.rfp_posts enable row level security;");
      await old.exec(patch);
      expect((await old.query<{ ok: boolean }>("select has_table_privilege('service_role','public.rfp_posts','INSERT') as ok")).rows[0].ok).toBe(true);
      await old.exec(patch);
    } finally { await old.close(); }
  });
});
