import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

const MIGRATION = "20261101000300_bid_comparisons.sql";
const sql = (file: string) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8").replace(/create index[^;]*using gin[^;]*;/gi, "");

async function freshDb(runs = 1): Promise<PGlite> {
  const d = await createTestDb();
  for (let i = 0; i < runs; i++) await d.exec(sql(MIGRATION));
  // The harness grants every table after its own migrations; repeat for ours.
  await d.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;`);
  return d;
}

/**
 * Migration 20261101000300 (bid comparison sheet) against real Postgres
 * (PGlite): each PM company sees and edits only its own comparisons and
 * bids, a bid can't be hung on another company's comparison, a comparison
 * can only link the company's own RFP, anon sees nothing, at most 6 bids,
 * and the migration runs twice. (Column-level grants aren't testable here:
 * the harness grants every table wholesale at the end.)
 */

let db: PGlite;
const ids = {
  pmA: randomUUID(),
  pmB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  rfpA: randomUUID(),
  rfpB: randomUUID(),
  cmpA: randomUUID(),
  cmpB: randomUUID(),
  bidA: randomUUID(),
  bidB: randomUUID(),
};

beforeAll(async () => {
  db = await freshDb();
  const mkUser = (id: string, name: string) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: "property_manager" })]);
  await mkUser(ids.pmA, "pm-a");
  await mkUser(ids.pmB, "pm-b");
  await db.query(
    `insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'PM A','pm-a','property_manager','approved'), ($2,'PM B','pm-b','property_manager','approved')`,
    [ids.orgA, ids.orgB],
  );
  await db.query(`insert into organization_members (organization_id, user_id) values ($1,$2), ($3,$4)`, [ids.orgA, ids.pmA, ids.orgB, ids.pmB]);
  await db.query(
    `insert into rfp_posts (id, title, slug, status, posted_by_user_id, posted_by_organization_id) values ($1,'Roof A','roof-a','published',$2,$3), ($4,'Roof B','roof-b','published',$5,$6)`,
    [ids.rfpA, ids.pmA, ids.orgA, ids.rfpB, ids.pmB, ids.orgB],
  );
  await db.query(
    `insert into bid_comparisons (id, organization_id, created_by, title, rfp_id) values ($1,$2,$3,'Roof replacement',$4), ($5,$6,$7,'Snow removal',null)`,
    [ids.cmpA, ids.orgA, ids.pmA, ids.rfpA, ids.cmpB, ids.orgB, ids.pmB],
  );
  await db.query(
    `insert into bid_comparison_bids (id, comparison_id, organization_id, company_name, total_price) values ($1,$2,$3,'Acme Roofing',48000), ($4,$5,$6,'Snow Pros',9000)`,
    [ids.bidA, ids.cmpA, ids.orgA, ids.bidB, ids.cmpB, ids.orgB],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("bid_comparisons RLS", () => {
  it("a PM reads only their own company's comparisons and bids", async () => {
    const cmp = await asUser(db, ids.pmA, () => db.query<{ id: string }>(`select id from bid_comparisons`));
    expect(cmp.rows.map((r) => r.id)).toEqual([ids.cmpA]);
    const bids = await asUser(db, ids.pmA, () => db.query<{ id: string }>(`select id from bid_comparison_bids`));
    expect(bids.rows.map((r) => r.id)).toEqual([ids.bidA]);
  });

  it("anon sees nothing", async () => {
    await expect(asAnon(db, () => db.query(`select id from bid_comparisons`))).rejects.toThrow();
    await expect(asAnon(db, () => db.query(`select id from bid_comparison_bids`))).rejects.toThrow();
  });

  it("a PM can create for their own company, not another's, and not as someone else", async () => {
    await asUser(db, ids.pmA, () =>
      db.query(`insert into bid_comparisons (organization_id, created_by, title) values ($1,$2,'Parking lot sealing')`, [ids.orgA, ids.pmA]),
    );
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into bid_comparisons (organization_id, created_by, title) values ($1,$2,'Sneaky')`, [ids.orgB, ids.pmA])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into bid_comparisons (organization_id, created_by, title) values ($1,$2,'Spoof')`, [ids.orgA, ids.pmB])),
    ).rejects.toThrow();
  });

  it("a comparison can only link an RFP the PM's company posted", async () => {
    await expect(
      asUser(db, ids.pmA, () =>
        db.query(`insert into bid_comparisons (organization_id, created_by, title, rfp_id) values ($1,$2,'Borrowed RFP',$3)`, [ids.orgA, ids.pmA, ids.rfpB]),
      ),
    ).rejects.toThrow();
    await expect(asUser(db, ids.pmA, () => db.query(`update bid_comparisons set rfp_id = $1 where id = $2`, [ids.rfpB, ids.cmpA]))).rejects.toThrow();
    const own = await asUser(db, ids.pmA, () => db.query(`update bid_comparisons set rfp_id = $1 where id = $2 returning id`, [ids.rfpA, ids.cmpA]));
    expect(own.rows).toHaveLength(1);
  });

  it("a PM can't edit or delete another company's comparison or bids", async () => {
    const upd = await asUser(db, ids.pmA, () => db.query(`update bid_comparisons set title = 'Hijacked' where id = $1 returning id`, [ids.cmpB]));
    expect(upd.rows).toEqual([]);
    const updBid = await asUser(db, ids.pmA, () => db.query(`update bid_comparison_bids set total_price = 1 where id = $1 returning id`, [ids.bidB]));
    expect(updBid.rows).toEqual([]);
    const del = await asUser(db, ids.pmA, () => db.query(`delete from bid_comparison_bids where id = $1 returning id`, [ids.bidB]));
    expect(del.rows).toEqual([]);
    const delCmp = await asUser(db, ids.pmA, () => db.query(`delete from bid_comparisons where id = $1 returning id`, [ids.cmpB]));
    expect(delCmp.rows).toEqual([]);
    const { rows } = await db.query<{ total_price: string }>(`select total_price from bid_comparison_bids where id = $1`, [ids.bidB]);
    expect(Number(rows[0].total_price)).toBe(9000);
  });

  it("a bid can't be hung on another company's comparison, even with the PM's own company id", async () => {
    await expect(
      asUser(db, ids.pmA, () =>
        db.query(`insert into bid_comparison_bids (comparison_id, organization_id, created_by, company_name) values ($1,$2,$3,'Planted')`, [ids.cmpB, ids.orgA, ids.pmA]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.pmA, () =>
        db.query(`insert into bid_comparison_bids (comparison_id, organization_id, created_by, company_name) values ($1,$2,$3,'Planted')`, [ids.cmpB, ids.orgB, ids.pmA]),
      ),
    ).rejects.toThrow();
    const ok = await asUser(db, ids.pmA, () =>
      db.query(`insert into bid_comparison_bids (comparison_id, organization_id, created_by, company_name, total_price) values ($1,$2,$3,'Top Roof',51000) returning id`, [ids.cmpA, ids.orgA, ids.pmA]),
    );
    expect(ok.rows).toHaveLength(1);
  });

  it("deleting a comparison removes its bids", async () => {
    const tmp = randomUUID();
    await db.query(`insert into bid_comparisons (id, organization_id, title) values ($1,$2,'Temp')`, [tmp, ids.orgA]);
    await db.query(`insert into bid_comparison_bids (comparison_id, organization_id, company_name) values ($1,$2,'X'), ($1,$2,'Y')`, [tmp, ids.orgA]);
    await asUser(db, ids.pmA, () => db.query(`delete from bid_comparisons where id = $1`, [tmp]));
    const { rows } = await db.query(`select id from bid_comparison_bids where comparison_id = $1`, [tmp]);
    expect(rows).toEqual([]);
  });
});

describe("bid_comparisons checks", () => {
  it("holds at most 6 bids per comparison", async () => {
    const cmp = randomUUID();
    await db.query(`insert into bid_comparisons (id, organization_id, title) values ($1,$2,'Six max')`, [cmp, ids.orgA]);
    for (let i = 0; i < 6; i++) await db.query(`insert into bid_comparison_bids (comparison_id, organization_id, company_name) values ($1,$2,$3)`, [cmp, ids.orgA, `Bidder ${i}`]);
    await expect(db.query(`insert into bid_comparison_bids (comparison_id, organization_id, company_name) values ($1,$2,'Seventh')`, [cmp, ids.orgA])).rejects.toThrow();
  });

  it("rejects an empty title, a bad country, negative money, tax over 100% and a malformed share hash", async () => {
    await expect(db.query(`insert into bid_comparisons (organization_id, title) values ($1,'')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into bid_comparisons (organization_id, title, country) values ($1,'X','MX')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into bid_comparison_bids (comparison_id, organization_id, company_name, total_price) values ($1,$2,'X',-1)`, [ids.cmpA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into bid_comparison_bids (comparison_id, organization_id, company_name, tax_percent) values ($1,$2,'X',101)`, [ids.cmpA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`update bid_comparisons set share_token_hash = 'not-a-hash' where id = $1`, [ids.cmpA])).rejects.toThrow();
    await expect(db.query(`update bid_comparisons set scope_items = '{"a":1}'::jsonb where id = $1`, [ids.cmpA])).rejects.toThrow();
  });

  it("an RFP response goes into a comparison once", async () => {
    const trade = randomUUID();
    const interest = randomUUID();
    await db.query(`insert into organizations (id, name, slug) values ($1,'Trade T','trade-t')`, [trade]);
    await db.query(`insert into rfp_interests (id, rfp_id, trade_organization_id) values ($1,$2,$3)`, [interest, ids.rfpA, trade]);
    await db.query(`insert into bid_comparison_bids (comparison_id, organization_id, company_name, rfp_interest_id) values ($1,$2,'Trade T',$3)`, [ids.cmpA, ids.orgA, interest]);
    await expect(
      db.query(`insert into bid_comparison_bids (comparison_id, organization_id, company_name, rfp_interest_id) values ($1,$2,'Trade T again',$3)`, [ids.cmpA, ids.orgA, interest]),
    ).rejects.toThrow();
  });

  it("removing the recommended or awarded bid clears the pointer", async () => {
    const bid = randomUUID();
    await db.query(`insert into bid_comparison_bids (id, comparison_id, organization_id, company_name) values ($1,$2,$3,'Gone Soon')`, [bid, ids.cmpB, ids.orgB]);
    await db.query(`update bid_comparisons set recommended_bid_id = $1, awarded_bid_id = $1, awarded_company = 'Gone Soon' where id = $2`, [bid, ids.cmpB]);
    await db.query(`delete from bid_comparison_bids where id = $1`, [bid]);
    const { rows } = await db.query<{ recommended_bid_id: string | null; awarded_bid_id: string | null; awarded_company: string }>(
      `select recommended_bid_id, awarded_bid_id, awarded_company from bid_comparisons where id = $1`,
      [ids.cmpB],
    );
    expect(rows[0]).toEqual({ recommended_bid_id: null, awarded_bid_id: null, awarded_company: "Gone Soon" });
  });

  it("is safe to run twice", async () => {
    const again = await freshDb(2);
    await again.close();
  });
});
