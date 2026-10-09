import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Karma migration (20261010000001): the public sees LEVELS only (and only for
 * listed companies), members read their own company's score and ledger
 * (without who voted), admins read everything, and nobody but the service
 * role writes.
 */

const KARMA = "20261010000001_karma.sql";
let db: PGlite;

const ids = {
  ann: randomUUID(), // member of acme
  bob: randomUUID(), // member of bolt
  admin: randomUUID(),
  acme: randomUUID(),
  bolt: randomUUID(),
  draft: randomUUID(),
};

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

beforeAll(async () => {
  db = await createTestDb(["20260924000002_gc_packages.sql", KARMA]);
  // Safe to run twice.
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", KARMA), "utf8"));

  for (const [id, name, role] of [[ids.ann, "Ann", "trade"], [ids.bob, "Bob", "property_manager"], [ids.admin, "Root", "admin"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: role === "admin" ? "trade" : role })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(`insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Acme','acme','trade_company','approved'), ($2,'Bolt PM','bolt','property_manager','approved'), ($3,'Draft Co','draft','trade_company','draft')`, [ids.acme, ids.bolt, ids.draft]);
  await db.query(`insert into organization_members (organization_id, user_id) values ($1,$2), ($3,$4)`, [ids.acme, ids.ann, ids.bolt, ids.bob]);

  // Server-side writes (the test runs as the owner role, like the service role).
  await db.query(
    `insert into karma_events (org_id, user_id, kind, points, source_type, source_id, actor_id) values
       ($1::uuid, $2::uuid, 'forum_answer_upvote', 5, 'forum_post', 'p1', $3::text),
       ($1::uuid, null, 'profile_approved', 20, 'organization', $5::text, ''),
       ($4::uuid, null, 'profile_approved', 20, 'organization', $6::text, '')`,
    [ids.acme, ids.ann, ids.bob, ids.bolt, ids.acme, ids.bolt],
  );
  await db.query(`insert into org_karma (org_id, raw_points, score, level) values ($1, 180, 180, 3), ($2, 20, 20, 1), ($3, 90, 90, 2)`, [ids.acme, ids.bolt, ids.draft]);
  await db.query(
    `insert into rfp_posts (title, slug, status, source_type, posted_by_organization_id) values
       ('Roofing package', 'pkg-live', 'published', 'gc_package', $1),
       ('Roofing package 2', 'pkg-pending', 'pending_review', 'gc_package', $1),
       ('Bolt package', 'pkg-bolt', 'published', 'gc_package', $2)`,
    [ids.acme, ids.bolt],
  );
});

describe("karma RLS", () => {
  it("shows the public levels only, for listed companies only", async () => {
    const pub = await asAnon(db, () => rows<{ org_id: string; level: number }>("select * from org_karma_public order by level desc"));
    expect(pub).toEqual([
      { org_id: ids.acme, level: 3 },
      { org_id: ids.bolt, level: 1 },
    ]);
    expect(Object.keys(pub[0]).sort()).toEqual(["level", "org_id"]);
  });

  it("hides scores and the ledger from the public", async () => {
    expect(await asAnon(db, () => rows("select * from org_karma"))).toEqual([]);
    expect(await asAnon(db, () => rows("select * from karma_events"))).toEqual([]);
    await expect(asAnon(db, () => rows("select * from karma_ledger"))).rejects.toThrow();
  });

  it("lets members read their own company's score and ledger, without who voted", async () => {
    const own = await asUser(db, ids.ann, () => rows<{ org_id: string; score: number }>("select org_id, score from org_karma"));
    expect(own).toEqual([{ org_id: ids.acme, score: 180 }]);
    const ledger = await asUser(db, ids.ann, () => rows<Record<string, unknown>>("select * from karma_ledger order by points"));
    expect(ledger).toHaveLength(2);
    expect(ledger.every((r) => r.org_id === ids.acme)).toBe(true);
    expect(Object.keys(ledger[0])).not.toContain("actor_id");
    // The raw table (with actor ids) stays admin-only.
    expect(await asUser(db, ids.ann, () => rows("select * from karma_events"))).toEqual([]);
  });

  it("keeps other companies' scores private", async () => {
    const bob = await asUser(db, ids.bob, () => rows<{ org_id: string }>("select org_id from org_karma"));
    expect(bob.map((r) => r.org_id)).toEqual([ids.bolt]);
    const ledger = await asUser(db, ids.bob, () => rows<{ org_id: string }>("select org_id from karma_ledger"));
    expect(ledger.map((r) => r.org_id)).toEqual([ids.bolt]);
  });

  it("lets admins read everything", async () => {
    expect(await asUser(db, ids.admin, () => rows("select * from karma_events"))).toHaveLength(3);
    expect(await asUser(db, ids.admin, () => rows("select * from org_karma"))).toHaveLength(3);
  });

  it("lets nobody write directly, not even a member of the company", async () => {
    await expect(
      asUser(db, ids.ann, () => db.query(`insert into karma_events (org_id, kind, points, source_type, source_id) values ($1, 'admin_adjustment', 500, 'admin', 'x')`, [ids.acme])),
    ).rejects.toThrow();
    await expect(asUser(db, ids.ann, () => db.query(`insert into org_karma (org_id, score, level) values ($1, 9999, 5)`, [ids.draft]))).rejects.toThrow();
    await asUser(db, ids.ann, () => db.query(`update org_karma set level = 5, score = 9999 where org_id = $1`, [ids.acme]));
    await asUser(db, ids.ann, () => db.query(`delete from karma_events where org_id = $1`, [ids.acme]));
    const [k] = await rows<{ level: number }>(`select level from org_karma where org_id = $1`, [ids.acme]);
    expect(k.level).toBe(3);
    expect(await rows(`select id from karma_events where org_id = $1`, [ids.acme])).toHaveLength(2);
  });

  it("shows GC package poster levels (2+) for published packages without naming the poster", async () => {
    const pkgs = await asAnon(db, () => rows<Record<string, unknown>>("select * from gc_package_levels"));
    expect(pkgs).toEqual([{ slug: "pkg-live", level: 3 }]);
  });
});

describe("karma ledger constraints", () => {
  it("is idempotent on (company, kind, source, actor)", async () => {
    await expect(
      db.query(`insert into karma_events (org_id, kind, points, source_type, source_id, actor_id) values ($1, 'forum_answer_upvote', 5, 'forum_post', 'p1', $2)`, [ids.acme, ids.bob]),
    ).rejects.toThrow();
    // A different voter on the same post is a different event.
    await db.query(`insert into karma_events (org_id, kind, points, source_type, source_id, actor_id) values ($1, 'forum_answer_upvote', 5, 'forum_post', 'p1', 'someone-else')`, [ids.acme]);
  });

  it("requires a reason on admin adjustments and rejects unknown kinds", async () => {
    await expect(db.query(`insert into karma_events (org_id, kind, points, source_type, source_id) values ($1, 'admin_adjustment', 10, 'admin', 'a1')`, [ids.acme])).rejects.toThrow();
    await db.query(`insert into karma_events (org_id, kind, points, source_type, source_id, reason) values ($1, 'admin_adjustment', 10, 'admin', 'a2', 'Verified referral by email')`, [ids.acme]);
    await expect(db.query(`insert into karma_events (org_id, kind, points, source_type, source_id) values ($1, 'login', 1, 'x', 'y')`, [ids.acme])).rejects.toThrow();
  });
});
