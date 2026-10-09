import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";
import { reviewerDisplayName } from "@/lib/projects/reviews";

/**
 * Portfolio migration (20261009000002): who can read a project by its
 * visibility, who can read private share links, that reviews on a private
 * project stay off the public view, and the column constraints — against
 * the real SQL in PGlite.
 */

const PORTFOLIO = "20261009000002_portfolio.sql";
let db: PGlite;

const ids = {
  owner: randomUUID(),
  stranger: randomUUID(),
  org: randomUUID(),
  otherOrg: randomUUID(),
  pub: randomUUID(),
  unlisted: randomUUID(),
  priv: randomUUID(),
  pending: randomUUID(),
  rfp: randomUUID(),
};

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

const slugs = (r: { slug: string }[]) => r.map((x) => x.slug).sort();

beforeAll(async () => {
  db = await createTestDb(["20260819000001_seo_tier_reviews_case_studies.sql", "20260924000001_projects.sql", PORTFOLIO]);
  // Safe to run twice (the owner may paste it again).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", PORTFOLIO), "utf8"));

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

  const study = (id: string, slug: string, status: string, visibility: string) =>
    db.query(
      `insert into case_studies (id, organization_id, title, slug, challenge, approach, outcome, status, visibility)
       values ($1,$2,$3,$3,'c','a','o',$4,$5)`,
      [id, ids.org, slug, status, visibility],
    );
  await study(ids.pub, "public-job", "published", "public");
  await study(ids.unlisted, "unlisted-job", "published", "unlisted");
  await study(ids.priv, "private-job", "published", "private");
  await study(ids.pending, "pending-job", "pending_review", "public");

  await db.query(
    `insert into case_study_share_links (case_study_id, organization_id, token) values ($1,$2,'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')`,
    [ids.priv, ids.org],
  );

  const review = (cs: string, name: string) =>
    db.query(
      `insert into vendor_reviews (organization_id, case_study_id, reviewer_name, rating, body, status, verified_via)
       values ($1,$2,$3,5,'Great work','published','project_invite')`,
      [ids.org, cs, name],
    );
  await review(ids.pub, "Public Reviewer");
  await review(ids.priv, "Private Reviewer");
});

describe("case_studies visibility (RLS)", () => {
  it("defaults to public and rejects unknown values", async () => {
    const [r] = await rows<{ visibility: string; results: unknown; ai_assisted: boolean }>(
      `select visibility, results, ai_assisted from case_studies where id = $1`,
      [ids.pending],
    );
    expect(r).toMatchObject({ visibility: "public", results: [], ai_assisted: false });
    await expect(db.query(`update case_studies set visibility = 'secret' where id = $1`, [ids.pub])).rejects.toThrow();
  });

  it("anon reads published public and unlisted projects, never private or pending ones", async () => {
    const r = await asAnon(db, () => rows<{ slug: string }>(`select slug from case_studies`));
    expect(slugs(r)).toEqual(["public-job", "unlisted-job"]);
  });

  it("another company's member sees the same as anon", async () => {
    const r = await asUser(db, ids.stranger, () => rows<{ slug: string }>(`select slug from case_studies`));
    expect(slugs(r)).toEqual(["public-job", "unlisted-job"]);
  });

  it("the company's own members see every project, private and pending included", async () => {
    const r = await asUser(db, ids.owner, () => rows<{ slug: string }>(`select slug from case_studies`));
    expect(slugs(r)).toEqual(["pending-job", "private-job", "public-job", "unlisted-job"]);
  });

  it("members can't flip a published project's visibility directly (service role only)", async () => {
    await asUser(db, ids.owner, () => rows(`update case_studies set visibility = 'public' where id = $1`, [ids.priv]));
    const [r] = await rows<{ visibility: string }>(`select visibility from case_studies where id = $1`, [ids.priv]);
    expect(r.visibility).toBe("private");
  });
});

describe("case-study builder columns", () => {
  it("results must be an array of at most four figures", async () => {
    await db.query(`update case_studies set results = $2::jsonb where id = $1`, [
      ids.pub,
      JSON.stringify([{ value: "24,000 sq ft", label: "roof" }]),
    ]);
    await expect(db.query(`update case_studies set results = '{}'::jsonb where id = $1`, [ids.pub])).rejects.toThrow();
    await expect(
      db.query(`update case_studies set results = $2::jsonb where id = $1`, [
        ids.pub,
        JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ value: String(i), label: "x" }))),
      ]),
    ).rejects.toThrow();
  });

  it("client type is a fixed list", async () => {
    await db.query(`update case_studies set client_type = 'condo_board' where id = $1`, [ids.pub]);
    await expect(db.query(`update case_studies set client_type = 'Maple REIT' where id = $1`, [ids.pub])).rejects.toThrow();
  });
});

describe("private share links", () => {
  it("only the company's members can read its links", async () => {
    expect(await asUser(db, ids.owner, () => rows(`select token from case_study_share_links`))).toHaveLength(1);
    expect(await asUser(db, ids.stranger, () => rows(`select token from case_study_share_links`))).toHaveLength(0);
    expect(await asAnon(db, () => rows(`select token from case_study_share_links`))).toHaveLength(0);
  });

  it("members can't create links directly (service role only)", async () => {
    await expect(
      asUser(db, ids.owner, () =>
        rows(`insert into case_study_share_links (case_study_id, organization_id, token) values ($1,$2,'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB')`, [
          ids.priv,
          ids.org,
        ]),
      ),
    ).rejects.toThrow();
  });

  it("tokens must look like our 32-character tokens", async () => {
    await expect(
      db.query(`insert into case_study_share_links (case_study_id, organization_id, token) values ($1,$2,'short')`, [ids.priv, ids.org]),
    ).rejects.toThrow();
  });
});

describe("reviews on private projects", () => {
  it("stay off the public review view", async () => {
    const r = await asAnon(db, () => rows<{ reviewer_display_name: string }>(`select reviewer_display_name from vendor_reviews_public`));
    expect(r.map((x) => x.reviewer_display_name)).toEqual(["Public R."]);
  });

  it("the app's name rule matches the view's", async () => {
    const [r] = await rows<{ reviewer_display_name: string }>(`select reviewer_display_name from vendor_reviews_public`);
    expect(reviewerDisplayName("Public Reviewer", false)).toBe(r.reviewer_display_name);
    expect(reviewerDisplayName("  Bob van Smith ", false)).toBe("Bob v.");
    expect(reviewerDisplayName("Cher", false)).toBe("Cher");
    expect(reviewerDisplayName("Sarah Kim", true)).toBe("Sarah Kim");
  });
});

describe("projects attached to an interest", () => {
  it("allow up to three ids", async () => {
    await db.query(
      `insert into rfp_posts (id, title, slug, summary, scope, status) values ($1,'Roof','roof-rfp','s','scope','published')`,
      [ids.rfp],
    );
    const insert = (n: number) =>
      db.query(
        `insert into rfp_interests (rfp_id, trade_organization_id, message, case_study_ids) values ($1,$2,'hi',$3::uuid[])`,
        [ids.rfp, ids.otherOrg, Array.from({ length: n }, () => randomUUID())],
      );
    await expect(insert(4)).rejects.toThrow();
    await insert(3);
    const [r] = await rows<{ n: number }>(`select cardinality(case_study_ids) as n from rfp_interests where rfp_id = $1`, [ids.rfp]);
    expect(r.n).toBe(3);
  });
});
