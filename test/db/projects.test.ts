import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Projects migration (20260924000001): the review privacy model and invite
 * visibility, against the real SQL in PGlite. Storage steps are skipped
 * (no storage schema here), which also proves they can't abort the file.
 */

const PROJECTS = "20260924000001_projects.sql";
let db: PGlite;

const ids = {
  owner: randomUUID(),
  stranger: randomUUID(),
  org: randomUUID(),
  otherOrg: randomUUID(),
  study: randomUUID(),
};

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

beforeAll(async () => {
  db = await createTestDb(["20260819000001_seo_tier_reviews_case_studies.sql", PROJECTS]);
  // Safe to run twice (the owner may paste it again).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", PROJECTS), "utf8"));

  const mkUser = (id: string, name: string) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [
      id,
      `${name}@example.com`,
      JSON.stringify({ full_name: name, primary_role: "trade" }),
    ]);
  await mkUser(ids.owner, "Owner");
  await mkUser(ids.stranger, "Stranger");
  for (const [id, slug] of [[ids.org, "acme"], [ids.otherOrg, "other"]]) {
    await db.query(
      `insert into organizations (id, name, slug, organization_type, profile_status) values ($1,$2,$3,'trade_company','approved')`,
      [id, slug, slug],
    );
  }
  await db.query(`insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')`, [ids.org, ids.owner]);
  await db.query(`insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')`, [ids.otherOrg, ids.stranger]);

  await db.query(
    `insert into case_studies (id, organization_id, title, slug, challenge, approach, outcome, status, source)
     values ($1,$2,'Roof','roof-abcde','c','a','o','published','capture')`,
    [ids.study, ids.org],
  );
  await db.query(
    `insert into review_invites (token_hash, case_study_id, organization_id, client_name, client_email)
     values ('h1',$1,$2,'Sarah Kim','sarah@reit.com')`,
    [ids.study, ids.org],
  );
  const review = (name: string, company: string | null, show: boolean, status: string) =>
    db.query(
      `insert into vendor_reviews (organization_id, case_study_id, reviewer_name, reviewer_company, reviewer_email, rating, body, status, verified_via, show_building)
       values ($1,$2,$3,$4,'secret@reit.com',5,'Great work',$5,'project_invite',$6)`,
      [ids.org, ids.study, name, company, status, show],
    );
  await review("Sarah Kim", "Big REIT", true, "published");
  await review("  Bob van Smith ", "Quiet Co", false, "published");
  await review("Pending Person", "Nope Inc", true, "pending_review");
  await review("Cher", null, false, "published");
});

describe("case_studies project columns", () => {
  it("defaults photos to an empty array and constrains source", async () => {
    const [r] = await rows<{ photos: unknown; source: string; client_approved: boolean }>(
      `select photos, source, client_approved from case_studies where id = $1`,
      [ids.study],
    );
    expect(r).toMatchObject({ photos: [], source: "capture", client_approved: false });
    await expect(db.query(`update case_studies set source = 'scraped' where id = $1`, [ids.study])).rejects.toThrow();
    await expect(db.query(`update case_studies set photos = '{}'::jsonb where id = $1`, [ids.study])).rejects.toThrow();
  });
});

describe("vendor reviews privacy", () => {
  it("the public can't read the base table (emails, unconsented companies)", async () => {
    expect(await asAnon(db, () => rows(`select id from vendor_reviews`))).toHaveLength(0);
    expect(await asUser(db, ids.stranger, () => rows(`select id from vendor_reviews`))).toHaveLength(0);
  });

  it("the public view shows published reviews with consent applied", async () => {
    const r = await asAnon(db, () =>
      rows<{ reviewer_display_name: string; reviewer_company: string | null }>(
        `select reviewer_display_name, reviewer_company from vendor_reviews_public order by reviewer_display_name`,
      ),
    );
    expect(r).toEqual([
      { reviewer_display_name: "Bob v.", reviewer_company: null },
      { reviewer_display_name: "Cher", reviewer_company: null },
      { reviewer_display_name: "Sarah Kim", reviewer_company: "Big REIT" },
    ]);
  });

  it("never exposes the reviewer's email", async () => {
    await expect(asAnon(db, () => rows(`select reviewer_email from vendor_reviews_public`))).rejects.toThrow();
  });
});

describe("review invites", () => {
  it("members see their own org's invites; others and anon see none", async () => {
    expect(await asUser(db, ids.owner, () => rows(`select id from review_invites`))).toHaveLength(1);
    expect(await asUser(db, ids.stranger, () => rows(`select id from review_invites`))).toHaveLength(0);
    expect(await asAnon(db, () => rows(`select id from review_invites`))).toHaveLength(0);
  });

  it("members can't create invites directly (service role only)", async () => {
    await expect(
      asUser(db, ids.owner, () =>
        rows(
          `insert into review_invites (token_hash, case_study_id, organization_id, client_name, client_email)
           values ('h2',$1,$2,'Me','me@acme.com')`,
          [ids.study, ids.org],
        ),
      ),
    ).rejects.toThrow();
  });
});
