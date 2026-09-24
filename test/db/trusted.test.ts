import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Trusted-trades migration (20260924000004): who can read a page, that nobody
 * can write one directly (the server writes with the service role), and that
 * the new 'realtor' tier never unlocks RFPs.
 */

const TRUSTED = "20260924000004_trusted_trades.sql";
let db: PGlite;

const ids = {
  realtor: randomUUID(),
  hidden: randomUUID(),
  stranger: randomUUID(),
  trade: randomUUID(),
  realtorOrg: randomUUID(),
};

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

beforeAll(async () => {
  db = await createTestDb(["20260819000001_seo_tier_reviews_case_studies.sql", TRUSTED]);
  // Safe to run twice.
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", TRUSTED), "utf8"));

  for (const [id, name] of [[ids.realtor, "Dana"], [ids.hidden, "Hidden"], [ids.stranger, "Stranger"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [
      id,
      `${name}@example.com`,
      JSON.stringify({ full_name: name, primary_role: "property_manager" }),
    ]);
  }
  await db.query(
    `insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Acme Roofing','acme','trade_company','approved')`,
    [ids.trade],
  );
  await db.query(
    `insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Hallmark','hallmark','property_manager','approved')`,
    [ids.realtorOrg],
  );
  await db.query(`insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')`, [ids.realtorOrg, ids.realtor]);

  // Server-side writes (service role bypasses RLS; the test runs as the owner role).
  await db.query(
    `insert into trusted_lists (owner_id, organization_id, handle, display_name) values ($1,$2,'dana-cohen','Dana Cohen')`,
    [ids.realtor, ids.realtorOrg],
  );
  await db.query(
    `insert into trusted_lists (owner_id, handle, display_name, published) values ($1,'hidden-page','Hidden',false)`,
    [ids.hidden],
  );
  for (const owner of [ids.realtor, ids.hidden]) {
    await db.query(`insert into trusted_list_items (owner_id, organization_id, note) values ($1,$2,'Great roofer')`, [owner, ids.trade]);
  }
});

describe("trusted trades", () => {
  it("shows published pages to everyone, hidden ones only to their owner", async () => {
    const anonLists = await asAnon(db, () => rows<{ handle: string }>("select handle from trusted_lists"));
    expect(anonLists.map((r) => r.handle)).toEqual(["dana-cohen"]);
    const anonItems = await asAnon(db, () => rows<{ owner_id: string }>("select owner_id from trusted_list_items"));
    expect(anonItems.map((r) => r.owner_id)).toEqual([ids.realtor]);

    const ownerLists = await asUser(db, ids.hidden, () => rows<{ handle: string }>("select handle from trusted_lists order by handle"));
    expect(ownerLists.map((r) => r.handle)).toEqual(["dana-cohen", "hidden-page"]);
    const strangerItems = await asUser(db, ids.stranger, () => rows("select * from trusted_list_items"));
    expect(strangerItems).toHaveLength(1);
  });

  it("lets nobody write directly, not even the owner", async () => {
    await expect(
      asAnon(db, () => db.query(`insert into trusted_lists (owner_id, handle, display_name) values ($1,'spam-page','Spam')`, [ids.stranger])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.stranger, () =>
        db.query(`insert into trusted_list_items (owner_id, organization_id) values ($1,$2)`, [ids.realtor, ids.trade]),
      ),
    ).rejects.toThrow();
    // No update policy: the owner's own direct update touches nothing.
    await asUser(db, ids.realtor, () => db.query(`update trusted_lists set display_name = 'Hacked' where owner_id = $1`, [ids.realtor]));
    const [row] = await rows<{ display_name: string }>(`select display_name from trusted_lists where owner_id = $1`, [ids.realtor]);
    expect(row.display_name).toBe("Dana Cohen");
  });

  it("enforces the handle shape", async () => {
    await expect(
      db.query(`insert into trusted_lists (owner_id, handle, display_name) values ($1,'Bad Handle','X Y')`, [ids.stranger]),
    ).rejects.toThrow();
  });

  it("accepts the realtor tier without granting RFP access", async () => {
    await db.query(`insert into subscriptions (organization_id, status, tier) values ($1,'active','realtor')`, [ids.realtorOrg]);
    const [{ ok }] = await rows<{ ok: boolean }>(`select public.has_active_trade_access($1) as ok`, [ids.realtor]);
    expect(ok).toBe(false);
    await expect(
      db.query(`insert into subscriptions (organization_id, status, tier) values ($1,'active','bogus')`, [ids.trade]),
    ).rejects.toThrow();
  });
});
