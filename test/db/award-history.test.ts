import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/** award_history + bid_results (20261017000040): Intel subscribers and admins read; nobody else; service role writes. */
const INTEL = "20261017000001_intel_access.sql";
const MIGRATION = "20261017000040_award_history.sql";
let db: PGlite;
const ids = { admin: randomUUID(), intel: randomUUID(), free: randomUUID(), orgIntel: randomUUID(), orgFree: randomUUID(), award: randomUUID() };

beforeAll(async () => {
  db = await createTestDb([INTEL, MIGRATION]);
  // Again after the harness's blanket test grants, so the migration's revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8").split("\n").filter((l) => !l.includes("using gin (")).join("\n"));
  for (const [id, name] of [[ids.admin, "Root"], [ids.intel, "Ivy"], [ids.free, "Fred"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name.toLowerCase()}@example.com`, JSON.stringify({ full_name: name })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(`insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Intel Co','intel-co','trade_company','approved'), ($2,'Free Co','free-co','trade_company','approved')`, [ids.orgIntel, ids.orgFree]);
  await db.query(`insert into organization_members (organization_id, user_id) values ($1,$2), ($3,$4)`, [ids.orgIntel, ids.intel, ids.orgFree, ids.free]);
  await db.query(`insert into intel_access (organization_id, status, source) values ($1, 'comped', 'admin')`, [ids.orgIntel]);
  await db.query(
    `insert into award_history (id, source, source_key, title, winner_business_name, winner_key, value, currency, country, award_date, end_date, end_date_source, trade_slugs, licence, attribution, as_of)
     values ($1, 'ca-seao', 'ocds-1|a1', 'Déneigement', 'Déneigement Laval Inc.', 'deneigement laval', 240000, 'CAD', 'CA', '2026-08-20', '2029-04-30', 'stated', '{snow-removal}', 'CC BY 4.0', 'SEAO', '2026-10-01')`,
    [ids.award],
  );
  await db.query(
    `insert into bid_results (award_history_id, bidder_business_name, bidder_key, bidder_is_individual, bid_amount, currency, rank, status_label, as_of, source)
     values ($1, 'Déneigement Laval Inc.', 'deneigement laval', false, 240000, 'CAD', 1, 'awarded', '2026-10-01', 'ca-seao'),
            ($1, null, 'individual:1', true, 260000, 'CAD', 2, 'not_awarded', '2026-10-01', 'ca-seao')`,
    [ids.award],
  );
});

const rows = async (sql: string) => (await db.query(sql)).rows;

describe("award_history / bid_results", () => {
  it("Intel subscribers and admins read; free accounts see nothing; anon is refused", async () => {
    expect(await asUser(db, ids.intel, () => rows(`select id from award_history`))).toHaveLength(1);
    expect(await asUser(db, ids.admin, () => rows(`select id from bid_results`))).toHaveLength(2);
    expect(await asUser(db, ids.free, () => rows(`select id from award_history`))).toHaveLength(0);
    expect(await asUser(db, ids.free, () => rows(`select id from bid_results`))).toHaveLength(0);
    await expect(asAnon(db, () => rows(`select id from award_history`))).rejects.toThrow(/permission denied/);
  });

  it("no one writes but the service role", async () => {
    await expect(asUser(db, ids.intel, () => db.query(`update award_history set value = 1`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.admin, () => db.query(`delete from bid_results`))).rejects.toThrow(/permission denied/);
  });

  it("one currency per country, an end date always has its source, a winner is a business or flagged individual", async () => {
    const ins = (cur: string, country: string, extra = "") =>
      db.query(`insert into award_history (source, source_key, title, winner_business_name, currency, country, award_date, licence, attribution, as_of${extra ? ", end_date" : ""}) values ('test-src', '${randomUUID()}', 't', 'Acme Ltd', '${cur}', '${country}', '2025-01-01', 'l', 'a', '2026-10-16'${extra})`);
    await expect(ins("USD", "CA")).rejects.toThrow();
    await expect(ins("CAD", "US")).rejects.toThrow();
    await expect(ins("CAD", "CA", ", '2027-01-01'")).rejects.toThrow();
    await ins("USD", "US");
    await expect(db.query(`insert into award_history (source, source_key, title, currency, country, award_date, licence, attribution, as_of) values ('test-src', 'nameless', 't', 'CAD', 'CA', '2025-01-01', 'l', 'a', '2026-10-16')`)).rejects.toThrow();
  });

  it("the intel slice returns running contracts first", async () => {
    const r = await db.query<{ s: unknown[] }>(`select public.award_history_intel_slice('CA', '2021-10-16', 10) as s`);
    const slice = r.rows[0].s as { id: string; has_bids: boolean; running?: boolean }[];
    expect(slice).toHaveLength(1);
    expect(slice[0]).toMatchObject({ id: ids.award, has_bids: true });
    expect(slice[0].running).toBeUndefined();
  });
});
