import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Major projects migration (20261012000001): the public view shows
 * open-data rows and APPROVED research rows only, never the Trade Pro
 * fields; Trade Pro members read the full row (general contractor, bid-list
 * link); free members and the public can't read the table at all; admins
 * read everything (the review queue); and the table is Canada only.
 */

const MIGRATION = "20261012000001_major_projects.sql";
let db: PGlite;

const ids = { admin: randomUUID(), pro: randomUUID(), free: randomUUID(), proOrg: randomUUID(), freeOrg: randomUUID() };

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

const insert = (slug: string, source: string, extra: Record<string, unknown> = {}) => {
  const cols = { slug, source, source_key: `${source}:${slug}`, name: slug, license: "OGL", general_contractor: "PCL Constructors", bid_list_url: "https://example.com/prequal", ...extra };
  const keys = Object.keys(cols);
  return db.query(`insert into major_projects (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(cols));
};

beforeAll(async () => {
  db = await createTestDb([MIGRATION]);
  // Safe to run twice.
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));

  for (const [id, name] of [[ids.admin, "Root"], [ids.pro, "Pro"], [ids.free, "Free"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: "trade" })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(`insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Pro Co','pro-co','trade_company','approved'), ($2,'Free Co','free-co','trade_company','approved')`, [ids.proOrg, ids.freeOrg]);
  await db.query(`insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner'), ($3,$4,'owner')`, [ids.proOrg, ids.pro, ids.freeOrg, ids.free]);
  await db.query(`insert into subscriptions (organization_id, status, amount) values ($1,'active',249)`, [ids.proOrg]);

  // Service-role writes (the test runs as the owner role).
  await insert("open-data-row", "permits-calgary", { approved: true, review_status: "approved" });
  await insert("hidden-open-data", "permits-calgary", { review_status: "rejected" });
  await insert("pending-research", "manual", { approved: false, review_status: "pending", evidence: "S" });
  await insert("approved-research", "manual", { approved: true, review_status: "approved", evidence: "F" });
  await insert("stale-row", "bc-major-projects", { stale: true, stale_since: "2026-10-01" });
});

describe("major_projects RLS", () => {
  it("the public view lists open-data rows and approved research rows only", async () => {
    const slugs = await asAnon(db, () => rows<{ slug: string }>(`select slug from major_projects_public order by slug`));
    expect(slugs.map((r) => r.slug)).toEqual(["approved-research", "open-data-row", "stale-row"]);
  });

  it("the public view never carries the Trade Pro fields, only whether they exist", async () => {
    const [r] = await asAnon(db, () => rows<Record<string, unknown>>(`select * from major_projects_public where slug = 'open-data-row'`));
    expect(r).not.toHaveProperty("general_contractor");
    expect(r).not.toHaveProperty("bid_list_url");
    expect(r).not.toHaveProperty("bid_route");
    expect(r.has_gc).toBe(true);
    expect(r.has_bid_route).toBe(true);
  });

  it("anon and free members can't read the table", async () => {
    const anon = await asAnon(db, () => rows(`select * from major_projects`).catch(() => []));
    expect(anon).toHaveLength(0);
    const free = await asUser(db, ids.free, () => rows(`select * from major_projects`));
    expect(free).toHaveLength(0);
  });

  it("Trade Pro members read publishable rows in full, never pending or hidden ones", async () => {
    const pro = await asUser(db, ids.pro, () => rows<{ slug: string; general_contractor: string }>(`select slug, general_contractor from major_projects order by slug`));
    expect(pro.map((r) => r.slug)).toEqual(["approved-research", "open-data-row", "stale-row"]);
    expect(pro[0].general_contractor).toBe("PCL Constructors");
  });

  it("admins read the whole queue, and only admins can update", async () => {
    const all = await asUser(db, ids.admin, () => rows(`select slug from major_projects`));
    expect(all).toHaveLength(5);
    await asUser(db, ids.pro, () => db.query(`update major_projects set approved = true where slug = 'pending-research'`));
    const [still] = await rows<{ approved: boolean }>(`select approved from major_projects where slug = 'pending-research'`);
    expect(still.approved).toBe(false);
    await asUser(db, ids.admin, () => db.query(`update major_projects set approved = true, review_status = 'approved' where slug = 'pending-research'`));
    const now = await asAnon(db, () => rows(`select slug from major_projects_public where slug = 'pending-research'`));
    expect(now).toHaveLength(1);
  });

  it("the admin source counts are admin-only", async () => {
    const admin = await asUser(db, ids.admin, () => rows<{ source: string }>(`select source from major_project_source_counts`));
    expect(admin.length).toBeGreaterThan(0);
    const pro = await asUser(db, ids.pro, () => rows(`select source from major_project_source_counts`));
    expect(pro).toHaveLength(0);
  });

  it("is Canada only", async () => {
    await expect(insert("us-row", "permits-calgary", { country: "US" })).rejects.toThrow();
  });
});
