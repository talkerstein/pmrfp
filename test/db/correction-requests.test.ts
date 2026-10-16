import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/** correction_requests (20261017000050): only the service role inserts; admins read and resolve; nobody else sees anything. */
const MIGRATION = "20261017000050_correction_requests.sql";
let db: PGlite;
const ids = { admin: randomUUID(), member: randomUUID(), req: randomUUID() };

beforeAll(async () => {
  db = await createTestDb([MIGRATION]);
  // Again after the harness's blanket test grants, so the migration's revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  for (const [id, name] of [[ids.admin, "Root"], [ids.member, "Mia"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name.toLowerCase()}@example.com`, JSON.stringify({ full_name: name })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);
  // The route inserts as the service role (here: the owner, which bypasses RLS).
  await db.query(
    `insert into correction_requests (id, page_kind, page_path, reason, details, contact_email) values ($1, 'rfp', '/rfps/x-cb-1', 'personal_info', 'My home phone is on this page.', 'pat@example.com')`,
    [ids.req],
  );
});

const rows = async (sql: string) => (await db.query(sql)).rows;
const insertSql = `insert into correction_requests (page_kind, page_path, reason, details, contact_email) values ('rfp', '/rfps/y', 'wrong_info', 'The closing date is wrong.', 'a@b.co')`;

describe("correction_requests", () => {
  it("anon and members can neither read nor file requests through the API", async () => {
    await expect(asAnon(db, () => rows(`select id from correction_requests`))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => db.query(insertSql))).rejects.toThrow(/permission denied/);
    expect(await asUser(db, ids.member, () => rows(`select id from correction_requests`))).toHaveLength(0);
    await expect(asUser(db, ids.member, () => db.query(insertSql))).rejects.toThrow(/permission denied/);
  });

  it("admins read the queue and resolve requests; members can't change them", async () => {
    expect(await asUser(db, ids.admin, () => rows(`select id from correction_requests`))).toHaveLength(1);
    await asUser(db, ids.member, () => db.query(`update correction_requests set status = 'declined', resolution = 'x', resolved_at = now()`));
    expect((await rows(`select status from correction_requests`))[0]).toMatchObject({ status: "new" });
    await asUser(db, ids.admin, () =>
      db.query(`update correction_requests set status = 'removed', resolution = 'Phone number removed from the listing.', resolved_at = now(), resolved_by = $1 where id = $2`, [ids.admin, ids.req]),
    );
    expect((await rows(`select status, resolution from correction_requests`))[0]).toMatchObject({ status: "removed" });
    // Admins can't rewrite what the requester said.
    await expect(asUser(db, ids.admin, () => db.query(`update correction_requests set details = 'edited text here'`))).rejects.toThrow(/permission denied/);
  });

  it("a closed request needs a resolution and a date; inputs are bounded", async () => {
    await expect(db.query(`insert into correction_requests (page_kind, page_path, reason, details, contact_email, status) values ('rfp', '/x', 'other', 'long enough text', 'a@b.co', 'corrected')`)).rejects.toThrow();
    await expect(db.query(`insert into correction_requests (page_kind, page_path, reason, details, contact_email) values ('rfp', 'https://evil.example', 'other', 'long enough text', 'a@b.co')`)).rejects.toThrow();
    await expect(db.query(`insert into correction_requests (page_kind, page_path, reason, details, contact_email) values ('rfp', '/x', 'other', 'short', 'a@b.co')`)).rejects.toThrow();
    await expect(db.query(`insert into correction_requests (page_kind, page_path, reason, details, contact_email) values ('rfp', '/x', 'other', 'long enough text', 'not-an-email')`)).rejects.toThrow();
    await expect(db.query(`insert into correction_requests (page_kind, page_path, reason, details, contact_email) values ('nope', '/x', 'other', 'long enough text', 'a@b.co')`)).rejects.toThrow();
  });
});
