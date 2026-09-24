import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Spins up an in-process Postgres (PGlite) with a Supabase-compatible auth
 * shim, then loads the real migrations so we can assert RLS behaviour with
 * no Docker / cloud. The shim provides:
 *   - auth.users table (so the handle_new_user trigger + FKs work)
 *   - auth.uid() / auth.role() reading request.jwt.claims (as Supabase does)
 *   - anon / authenticated / service_role Postgres roles
 *
 * Migration SQL is loaded verbatim except: `create extension` lines and
 * trigram (`using gin`) index lines are stripped — PGlite lacks those
 * modules and they're irrelevant to RLS policy logic.
 */

const MIGRATIONS = [
  "20260529000001_schema.sql",
  "20260529000002_rls.sql",
  "20260529000004_reference_data.sql",
  "20260529000005_suppliers.sql",
  "20260529000006_security_hardening.sql",
];

const SHIM = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select case when coalesce(current_setting('request.jwt.claims', true), '') = ''
    then null
    else (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid end;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select case when coalesce(current_setting('request.jwt.claims', true), '') = ''
    then 'anon'
    else coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon') end;
$$;
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on auth.users to anon, authenticated, service_role;
`;

const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select, insert on all tables in schema public to anon;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

function loadMigration(file: string): string {
  const raw = readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8");
  return raw
    .split("\n")
    .filter((line) => {
      const l = line.trim().toLowerCase();
      if (l.startsWith("create extension")) return false;
      if (l.includes("using gin (")) return false;
      return true;
    })
    .join("\n");
}

export type Db = PGlite;

/** `extra`: later migrations to load on top of the base set, in order. */
export async function createTestDb(extra: string[] = []): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SHIM);
  for (const m of [...MIGRATIONS, ...extra]) {
    await db.exec(loadMigration(m));
  }
  await db.exec(GRANTS);
  return db;
}

/** Run `fn` as an authenticated user with the given uid. */
export async function asUser<T>(
  db: PGlite,
  uid: string,
  fn: () => Promise<T>,
  role: "authenticated" = "authenticated",
): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: uid, role }),
  ]);
  await db.exec(`set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

/** Run `fn` as the anonymous (logged-out) visitor. */
export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  await db.exec("set role anon;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

/** Count helper. */
export async function count(db: PGlite, sql: string, params: unknown[] = []): Promise<number> {
  const res = await db.query<{ rows: unknown[] }>(sql, params);
  return (res.rows as unknown[]).length;
}
