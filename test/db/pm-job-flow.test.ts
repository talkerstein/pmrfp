import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb } from "./harness";

/**
 * Migration 20261021000020 (PM job flow) against real Postgres (PGlite):
 * the free monthly allowance trigger, one pick per job, responses and
 * decisions written by the server only, and "only review publishes".
 */

const MIGRATION = "20261021000020_pm_job_flow.sql";
let db: PGlite;
const ids = {
  admin: randomUUID(),
  trade: randomUUID(),
  pm: randomUUID(),
  tradeOrg: randomUUID(),
  pmOrg: randomUUID(),
  rfps: Array.from({ length: 6 }, () => randomUUID()),
  pending: randomUUID(),
};

beforeAll(async () => {
  db = await createTestDb([MIGRATION]);
  const mkUser = (id: string, role: string, name: string) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: role })]);
  await mkUser(ids.admin, "admin", "admin");
  await mkUser(ids.trade, "trade", "trade");
  await mkUser(ids.pm, "property_manager", "pm");
  await db.query(`insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Roofer','roofer','trade_company','approved'), ($2,'PM Co','pm-co','property_manager','approved')`, [ids.tradeOrg, ids.pmOrg]);
  await db.query(`insert into organization_members (organization_id, user_id) values ($1,$2), ($3,$4)`, [ids.tradeOrg, ids.trade, ids.pmOrg, ids.pm]);
  for (const [i, id] of ids.rfps.entries()) {
    await db.query(
      `insert into rfp_posts (id, title, slug, status, source_type, posted_by_user_id, posted_by_organization_id, published_at) values ($1,$2,$2,'published','property_manager_direct',$3,$4,now())`,
      [id, `job-${i}`, ids.pm, ids.pmOrg],
    );
  }
  await db.query(`insert into rfp_posts (id, title, slug, status, source_type, posted_by_user_id) values ($1,'waiting','waiting','pending_review','property_manager_direct',$2)`, [ids.pending, ids.pm]);
});
afterAll(async () => {
  await db?.close();
});

const free = (rfp: string, createdAt = "now()") =>
  db.query(`insert into rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message, used_free_allowance, created_at) values ($1,$2,$3,'hi',true,${createdAt})`, [
    rfp,
    ids.tradeOrg,
    ids.trade,
  ]);

describe("free allowance (3 a calendar month, Toronto time)", () => {
  it("allows three free responses this month, refuses the fourth; last month's and Pro ones don't count", async () => {
    await free(ids.rfps[0], "now() - interval '40 days'");
    await free(ids.rfps[1]);
    await free(ids.rfps[2]);
    await free(ids.rfps[3]);
    await expect(free(ids.rfps[4])).rejects.toThrow(/free response limit/);
    // A Pro (or trial) response doesn't use the allowance.
    await db.query(`insert into rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message) values ($1,$2,$3,'pro')`, [ids.rfps[4], ids.tradeOrg, ids.trade]);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from rfp_interests where trade_organization_id = $1`, [ids.tradeOrg]);
    expect(rows[0].n).toBe(5);
  });

  it("stores the quote and rejects bad values", async () => {
    await db.query(`update rfp_interests set quote_amount = 4800, quote_kind = 'firm', start_date = '2026-11-03' where rfp_id = $1`, [ids.rfps[1]]);
    await expect(db.query(`update rfp_interests set quote_kind = 'maybe' where rfp_id = $1`, [ids.rfps[1]])).rejects.toThrow();
    await expect(db.query(`update rfp_interests set quote_amount = -1 where rfp_id = $1`, [ids.rfps[1]])).rejects.toThrow();
  });
});

describe("bid decisions", () => {
  it("allows the new statuses and only one pick per job", async () => {
    await db.query(`update rfp_interests set status = 'picked' where rfp_id = $1`, [ids.rfps[1]]);
    await db.query(`update rfp_interests set status = 'not_selected' where rfp_id = $1`, [ids.rfps[2]]);
    const other = randomUUID();
    await db.query(`insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Other','other-roofer','trade_company','approved')`, [other]);
    await db.query(`insert into rfp_interests (rfp_id, trade_organization_id, message) values ($1,$2,'second')`, [ids.rfps[1], other]);
    await expect(db.query(`update rfp_interests set status = 'picked' where rfp_id = $1 and trade_organization_id = $2`, [ids.rfps[1], other])).rejects.toThrow();
  });

  it("signed-in members can read their responses but not write them (the server does)", async () => {
    const mine = await asUser(db, ids.trade, () => db.query(`select id from rfp_interests where trade_organization_id = $1`, [ids.tradeOrg]));
    expect(mine.rows.length).toBe(5);
    // Even a paying member (the old "interest insert paid member" policy let them write directly).
    await db.query(`insert into subscriptions (organization_id, status, amount) values ($1,'active',249)`, [ids.tradeOrg]);
    expect((await db.query<{ ok: boolean }>(`select public.has_active_trade_access($1) as ok`, [ids.trade])).rows[0].ok).toBe(true);
    await expect(
      asUser(db, ids.trade, () => db.query(`insert into rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message) values ($1,$2,$3,'x')`, [ids.rfps[5], ids.tradeOrg, ids.trade])),
    ).rejects.toThrow();
    // The poster can't flip a response (e.g. reveal contacts) straight through the API either.
    const res = await asUser(db, ids.pm, () => db.query(`update rfp_interests set pm_contact_shared = true, status = 'picked' where rfp_id = $1 returning id`, [ids.rfps[3]]));
    expect(res.rows).toEqual([]);
    const { rows } = await db.query<{ pm_contact_shared: boolean }>(`select pm_contact_shared from rfp_interests where rfp_id = $1`, [ids.rfps[3]]);
    expect(rows[0].pm_contact_shared).toBe(false);
  });
});

describe("only review publishes", () => {
  it("a PM can't post straight to published, or publish their own waiting post", async () => {
    await expect(
      asUser(db, ids.pm, () => db.query(`insert into rfp_posts (title, slug, status, posted_by_user_id) values ('self','self-pub','published',$1)`, [ids.pm])),
    ).rejects.toThrow(/review/);
    await asUser(db, ids.pm, () => db.query(`insert into rfp_posts (title, slug, status, posted_by_user_id) values ('ok','ok-post','pending_review',$1)`, [ids.pm]));
    await expect(asUser(db, ids.pm, () => db.query(`update rfp_posts set status = 'published' where id = $1`, [ids.pending]))).rejects.toThrow(/review/);
  });

  it("a PM can still close or award their own listing; admins and the service role publish", async () => {
    await asUser(db, ids.pm, () => db.query(`update rfp_posts set status = 'closed', closed_at = now() where id = $1`, [ids.rfps[5]]));
    await asUser(db, ids.admin, () => db.query(`update rfp_posts set status = 'published', published_at = now() where id = $1`, [ids.pending]));
    await db.query(`update rfp_posts set status = 'published' where id = $1`, [ids.rfps[5]]);
    const { rows } = await db.query<{ id: string; status: string }>(`select id, status from rfp_posts where id in ($1,$2)`, [ids.pending, ids.rfps[5]]);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [ids.pending]: "published", [ids.rfps[5]]: "published" });
  });
});

describe("re-running the migration", () => {
  it("is safe, keeps the data, and leaves clients without insert/update on rfp_interests", async () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8");
    await db.exec(sql);
    await db.exec(sql);
    const priv = await db.query<{ ins: boolean; upd: boolean; sel: boolean }>(
      `select has_table_privilege('authenticated','public.rfp_interests','INSERT') as ins,
              has_table_privilege('authenticated','public.rfp_interests','UPDATE') as upd,
              has_table_privilege('authenticated','public.rfp_interests','SELECT') as sel`,
    );
    expect(priv.rows[0]).toEqual({ ins: false, upd: false, sel: true });
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from rfp_interests where status = 'picked'`);
    expect(rows[0].n).toBe(1);
  });
});
