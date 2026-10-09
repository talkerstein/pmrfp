import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Migration 20261009000003 (private project photos) against PGlite: it
 * creates the bucket PRIVATE, keeps it private when re-run (even if someone
 * flipped it public), adds no storage policy, and never aborts where
 * storage.* isn't writable.
 */

const SQL = readFileSync(join(process.cwd(), "supabase", "migrations", "20261009000003_private_project_photos.sql"), "utf8");

const STORAGE_SHIM = `
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
`;

describe("private project photos migration", () => {
  it("creates project-photos-private as a private bucket, idempotently", async () => {
    const db = new PGlite();
    await db.exec(STORAGE_SHIM);
    await db.exec(SQL);
    await db.exec(SQL);
    const { rows } = await db.query<{ id: string; public: boolean; allowed_mime_types: string[] }>(
      "select id, public, allowed_mime_types from storage.buckets",
    );
    expect(rows).toEqual([{ id: "project-photos-private", public: false, allowed_mime_types: ["image/jpeg"] }]);
  });

  it("puts it back to private if it was made public", async () => {
    const db = new PGlite();
    await db.exec(STORAGE_SHIM);
    await db.exec("insert into storage.buckets (id, name, public) values ('project-photos-private', 'project-photos-private', true)");
    await db.exec(SQL);
    const { rows } = await db.query<{ public: boolean }>("select public from storage.buckets where id = 'project-photos-private'");
    expect(rows[0].public).toBe(false);
  });

  it("adds no storage policy: only the service role can touch the bucket", async () => {
    const db = new PGlite();
    await db.exec(STORAGE_SHIM);
    await db.exec(SQL);
    const { rows } = await db.query("select policyname from pg_policies where schemaname = 'storage'");
    expect(rows).toEqual([]);
  });

  it("only warns where storage isn't writable (no storage schema here)", async () => {
    const db = new PGlite();
    await expect(db.exec(SQL)).resolves.toBeDefined();
  });
});
