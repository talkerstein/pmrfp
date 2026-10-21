import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * buyer_source_requests + buyer_permissions (20261021000010): the service
 * role writes requests; admins read and decide; pages read only the public
 * view (slug, scope, status, method, date). Seeded, and safe to re-run.
 */
const MIGRATION = "20261021000010_buyer_sources.sql";
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
  await db.query(
    `insert into buyer_source_requests (id, organization, contact_name, work_email, tenders_url, method, province_code, authorized)
     values ($1, 'City of Testville', 'Pat Buyer', 'pat@testville.ca', 'https://www.testville.ca/bids', 'read_public_page', 'BC', true)`,
    [ids.req],
  );
});

const rows = async (sql: string) => (await db.query(sql)).rows;

describe("buyer_permissions seed and public view", () => {
  it("is seeded once (re-running keeps one row per buyer)", async () => {
    const seeded = await rows(`select buyer_slug, status from buyer_permissions order by buyer_slug`);
    expect(seeded).toEqual([
      { buyer_slug: "bc-bid", status: "no" },
      { buyer_slug: "city-of-kawartha-lakes", status: "no" },
      { buyer_slug: "city-of-nanaimo", status: "yes" },
      { buyer_slug: "edmonton-public-schools", status: "no" },
      { buyer_slug: "nbon", status: "link_only" },
      { buyer_slug: "town-of-cochrane", status: "no" },
      { buyer_slug: "town-of-newmarket", status: "no" },
    ]);
  });

  it("anon reads the public view only: no contacts, quotes or notes", async () => {
    const view = await asAnon(db, () => rows(`select * from buyer_permissions_public where buyer_slug = 'city-of-nanaimo'`));
    // Yes to being listed; no method yet (its bids live on bids&tenders), so nothing imports.
    expect(view).toEqual([{ buyer_slug: "city-of-nanaimo", scope: "buyer", status: "yes", method: null, granted_on: expect.anything() }]);
    await expect(asAnon(db, () => rows(`select contact from buyer_permissions`))).rejects.toThrow(/permission denied/);
    expect(await asUser(db, ids.member, () => rows(`select buyer_slug from buyer_permissions`))).toHaveLength(0);
    expect(await asUser(db, ids.admin, () => rows(`select buyer_slug from buyer_permissions`))).toHaveLength(7);
  });

  it("statuses, methods and provinces are bounded; Canada only", async () => {
    await expect(db.query(`insert into buyer_permissions (buyer_slug, buyer_name, status, method) values ('city-of-x', 'City of X', 'yes', 'scrape')`)).rejects.toThrow();
    await expect(db.query(`insert into buyer_permissions (buyer_slug, buyer_name, status) values ('city-of-y', 'City of Y', 'maybe')`)).rejects.toThrow();
    await expect(db.query(`insert into buyer_permissions (buyer_slug, buyer_name, status, province_code) values ('city-of-z', 'City of Z', 'pending', 'NY')`)).rejects.toThrow();
    await expect(db.query(`insert into buyer_permissions (buyer_slug, buyer_name, status, country) values ('city-of-w', 'City of W', 'pending', 'US')`)).rejects.toThrow();
  });
});

describe("buyer_source_requests", () => {
  const insertSql = `insert into buyer_source_requests (organization, contact_name, work_email, tenders_url, method, province_code, authorized) values ('Town of Y', 'Yan', 'y@y.ca', 'https://y.ca/bids', 'email_notices', 'ON', true)`;

  it("anon and members can neither read nor file requests through the API", async () => {
    await expect(asAnon(db, () => rows(`select id from buyer_source_requests`))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => db.query(insertSql))).rejects.toThrow(/permission denied/);
    expect(await asUser(db, ids.member, () => rows(`select id from buyer_source_requests`))).toHaveLength(0);
    await expect(asUser(db, ids.member, () => db.query(insertSql))).rejects.toThrow(/permission denied/);
  });

  it("admins read and decide; they can't rewrite what the buyer submitted", async () => {
    expect(await asUser(db, ids.admin, () => rows(`select id from buyer_source_requests`))).toHaveLength(1);
    await asUser(db, ids.member, () => db.query(`update buyer_source_requests set status = 'approved', decided_at = now()`));
    expect((await rows(`select status from buyer_source_requests`))[0]).toMatchObject({ status: "new" });
    await asUser(db, ids.admin, () => db.query(`update buyer_source_requests set status = 'approved', decided_at = now(), decided_by = $1 where id = $2`, [ids.admin, ids.req]));
    expect((await rows(`select status from buyer_source_requests`))[0]).toMatchObject({ status: "approved" });
    await expect(asUser(db, ids.admin, () => db.query(`update buyer_source_requests set work_email = 'x@evil.example'`))).rejects.toThrow(/permission denied/);
  });

  it("needs the authorization box, a feed URL for feeds, a decision date, and a Canadian province", async () => {
    const base = `insert into buyer_source_requests (organization, contact_name, work_email, tenders_url, method, province_code, authorized`;
    await expect(db.query(`${base}) values ('Org', 'Pat', 'a@b.ca', 'https://b.ca', 'read_public_page', 'ON', false)`)).rejects.toThrow();
    await expect(db.query(`${base}) values ('Org', 'Pat', 'a@b.ca', 'https://b.ca', 'feed', 'ON', true)`)).rejects.toThrow();
    await expect(db.query(`${base}) values ('Org', 'Pat', 'a@b.ca', 'javascript:x', 'read_public_page', 'ON', true)`)).rejects.toThrow();
    await expect(db.query(`${base}) values ('Org', 'Pat', 'a@b.ca', 'https://b.ca', 'read_public_page', 'CA', true)`)).rejects.toThrow();
    await expect(db.query(`${base}, status) values ('Org', 'Pat', 'a@b.ca', 'https://b.ca', 'read_public_page', 'ON', true, 'approved')`)).rejects.toThrow();
    await db.query(`${base}, feed_url) values ('Org', 'Pat', 'a@b.ca', 'https://b.ca', 'feed', 'ON', true, 'https://b.ca/rss')`);
  });
});
