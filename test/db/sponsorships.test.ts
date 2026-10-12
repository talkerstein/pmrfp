import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Sponsorships migration (20261012000002, on top of the click counter):
 * admins manage sponsors; the public view shows only rows that hold a slot
 * and only live rows' copy (never contact or Stripe fields); impressions are
 * written in batches by the service role only; clicks gain a region and the
 * old three-argument call keeps working.
 */

const CLICKS = "20260925000003_sponsor_clicks.sql";
const MIGRATION = "20261012000002_sponsorships.sql";
let db: PGlite;
const ids = { admin: randomUUID(), member: randomUUID() };

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

const insert = (slug: string, extra: Record<string, unknown> = {}) => {
  const cols: Record<string, unknown> = {
    slug,
    name: slug,
    url: `https://${slug}.example.com`,
    tier: "province",
    country: "CA",
    trades: ["electrical"],
    regions: ["Ontario"],
    contact_email: `${slug}@example.com`,
    stripe_subscription_id: `sub_${slug}`,
    ...extra,
  };
  const keys = Object.keys(cols);
  return db.query(`insert into sponsors (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(cols));
};

beforeAll(async () => {
  db = await createTestDb([CLICKS, MIGRATION]);
  // Safe to run twice.
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  for (const [id, name] of [[ids.admin, "Root"], [ids.member, "Member"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: "trade" })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);

  await insert("live", { status: "approved", headline: "Bid bonds", message: "Surety for contractors.", cta: "Quote", start_date: "2026-10-01" });
  await insert("paid-waiting", { status: "pending" });
  await insert("draft-only", { status: "draft" });
  await insert("old", { status: "ended", start_date: "2025-01-01", end_date: "2025-06-30" });
});

describe("sponsors table", () => {
  it("rejects rows that break the slot rules", async () => {
    await expect(insert("nat-with-regions", { tier: "national" })).rejects.toThrow();
    await expect(insert("province-no-region", { regions: [] })).rejects.toThrow();
    await expect(insert("maple")).rejects.toThrow();
    await expect(insert("bad-url", { url: "http://x.example.com" })).rejects.toThrow();
    await expect(insert("bad-country", { country: "MX" })).rejects.toThrow();
    // Live means reviewed copy.
    await expect(insert("live-no-copy", { status: "approved", start_date: "2026-10-01" })).rejects.toThrow();
  });

  it("is admin-only", async () => {
    expect(await asUser(db, ids.admin, () => rows(`select slug from sponsors`))).toHaveLength(4);
    expect(await asUser(db, ids.member, () => rows(`select slug from sponsors`))).toHaveLength(0);
    await expect(asAnon(db, () => rows(`select slug from sponsors`))).rejects.toThrow();
  });
});

describe("sponsors_public", () => {
  it("lists rows that hold a slot, with copy only for live ones and nothing private", async () => {
    const r = await asAnon(db, () => rows<Record<string, unknown>>(`select * from sponsors_public order by slug`));
    expect(r.map((x) => x.slug)).toEqual(["live", "paid-waiting"]);
    expect(r[0]).toMatchObject({ slug: "live", name: "live", headline: "Bid bonds", url: "https://live.example.com" });
    expect(r[1]).toMatchObject({ slug: "paid-waiting", name: null, headline: null, url: null, status: "pending" });
    for (const x of r) {
      expect(x).not.toHaveProperty("contact_email");
      expect(x).not.toHaveProperty("stripe_subscription_id");
      expect(x).not.toHaveProperty("notes");
    }
  });
});

describe("counters", () => {
  it("adds impressions in one batched call", async () => {
    const batch = [
      { day: "2026-10-12", sponsor: "live", placement: "rfp_detail", trade: "electrical", region: "ontario", n: 5 },
      { day: "2026-10-12", sponsor: "live", placement: "rfp_detail", trade: "electrical", region: "ontario", n: 2 },
      { day: "2026-10-12", sponsor: "live", placement: "alerts_email", trade: "electrical", region: "ontario", n: 1 },
      { sponsor: "", placement: "x", n: 9 },
    ];
    await db.query(`select public.record_sponsor_impressions($1::jsonb)`, [JSON.stringify(batch)]);
    const r = await rows<{ placement: string; impressions: number }>(`select placement, impressions from sponsor_impressions order by placement`);
    expect(r).toEqual([
      { placement: "alerts_email", impressions: 1 },
      { placement: "rfp_detail", impressions: 7 },
    ]);
  });

  it("counts clicks by region, and the old three-argument call still works", async () => {
    await db.query(`select public.record_sponsor_click('live','rfp_detail','electrical','ontario')`);
    await db.query(`select public.record_sponsor_click('live','rfp_detail','electrical','ontario')`);
    await db.query(`select public.record_sponsor_click(p_sponsor => 'maple', p_placement => 'trade_page', p_trade => 'electrical')`);
    const r = await rows<{ sponsor: string; region: string; clicks: number }>(`select sponsor, region, clicks from sponsor_clicks order by sponsor`);
    expect(r).toEqual([
      { sponsor: "live", region: "ontario", clicks: 2 },
      { sponsor: "maple", region: "", clicks: 1 },
    ]);
  });

  it("can't be written or read by visitors or members", async () => {
    await expect(asAnon(db, () => db.query(`select public.record_sponsor_impressions('[]'::jsonb)`))).rejects.toThrow();
    await expect(asUser(db, ids.member, () => db.query(`select public.record_sponsor_impressions('[]'::jsonb)`))).rejects.toThrow();
    expect(await asUser(db, ids.member, () => rows(`select * from sponsor_impressions`))).toHaveLength(0);
    expect(await asUser(db, ids.admin, () => rows(`select * from sponsor_impressions`))).toHaveLength(2);
  });
});
