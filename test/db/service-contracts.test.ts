import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

const MIGRATION = "20261101000200_service_contracts.sql";
// notification_preferences comes from this one; its trigram index spans two
// lines, which the harness's line filter can't strip, so drop the whole statement.
const NOTIFS = "20260604000001_region_liquidity_waitlist_notifs.sql";
const sql = (file: string) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8").replace(/create index[^;]*using gin[^;]*;/gi, "");

async function freshDb(runs = 1): Promise<PGlite> {
  const d = await createTestDb();
  await d.exec(sql(NOTIFS));
  for (let i = 0; i < runs; i++) await d.exec(sql(MIGRATION));
  // The harness grants every table after its own migrations; repeat for ours.
  await d.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;`);
  return d;
}

/**
 * Migration 20261101000200 (contract renewal calendar) against real
 * Postgres (PGlite): each PM company sees and edits only its own
 * contracts, anon sees nothing, and the table checks reject bad values.
 * (Column-level grants aren't testable here: the harness grants every
 * table wholesale at the end.)
 */

let db: PGlite;
const ids = {
  pmA: randomUUID(),
  pmB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  contractA: randomUUID(),
  contractB: randomUUID(),
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
    `insert into service_contracts (id, organization_id, created_by, building_name, trade_slug, start_date, end_date, currency)
     values ($1,$2,$3,'Maple Court','snow-removal','2026-11-01','2027-04-30','CAD'),
            ($4,$5,$6,'Oak Tower','landscaping','2026-04-01','2026-11-30','USD')`,
    [ids.contractA, ids.orgA, ids.pmA, ids.contractB, ids.orgB, ids.pmB],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("service_contracts RLS", () => {
  it("a PM reads only their own company's contracts", async () => {
    const res = await asUser(db, ids.pmA, () => db.query<{ id: string }>(`select id from service_contracts`));
    expect(res.rows.map((r) => r.id)).toEqual([ids.contractA]);
    const b = await asUser(db, ids.pmB, () => db.query<{ id: string }>(`select id from service_contracts`));
    expect(b.rows.map((r) => r.id)).toEqual([ids.contractB]);
  });

  it("anon sees nothing", async () => {
    await expect(asAnon(db, () => db.query(`select id from service_contracts`))).rejects.toThrow();
  });

  it("a PM can add to their own calendar, not another company's, and not as someone else", async () => {
    await asUser(db, ids.pmA, () =>
      db.query(`insert into service_contracts (organization_id, created_by, service_detail) values ($1,$2,'Window washing')`, [ids.orgA, ids.pmA]),
    );
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into service_contracts (organization_id, created_by, trade_slug) values ($1,$2,'hvac')`, [ids.orgB, ids.pmA])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into service_contracts (organization_id, created_by, trade_slug) values ($1,$2,'hvac')`, [ids.orgA, ids.pmB])),
    ).rejects.toThrow();
  });

  it("a PM can't edit or delete another company's contracts", async () => {
    const upd = await asUser(db, ids.pmA, () => db.query(`update service_contracts set building_name = 'Hijacked' where id = $1 returning id`, [ids.contractB]));
    expect(upd.rows).toEqual([]);
    const del = await asUser(db, ids.pmA, () => db.query(`delete from service_contracts where id = $1 returning id`, [ids.contractB]));
    expect(del.rows).toEqual([]);
    const { rows } = await db.query<{ building_name: string }>(`select building_name from service_contracts where id = $1`, [ids.contractB]);
    expect(rows[0].building_name).toBe("Oak Tower");
    const own = await asUser(db, ids.pmA, () => db.query(`update service_contracts set vendor_name = 'Northline' where id = $1 returning id`, [ids.contractA]));
    expect(own.rows).toHaveLength(1);
  });

  it("a PM can't move their contract into another company", async () => {
    await expect(
      asUser(db, ids.pmA, () => db.query(`update service_contracts set organization_id = $1 where id = $2`, [ids.orgB, ids.contractA])),
    ).rejects.toThrow();
  });
});

describe("service_contracts checks", () => {
  it("needs a trade or a description, and an end after the start", async () => {
    await expect(db.query(`insert into service_contracts (organization_id) values ($1)`, [ids.orgA])).rejects.toThrow();
    await expect(
      db.query(`insert into service_contracts (organization_id, trade_slug, start_date, end_date) values ($1,'hvac','2027-01-01','2026-01-01')`, [ids.orgA]),
    ).rejects.toThrow();
  });

  it("rejects a malformed trade slug, an unknown currency, bad notice days, a negative value and an unknown reminder stage", async () => {
    await expect(db.query(`insert into service_contracts (organization_id, trade_slug) values ($1,'Not A Slug')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into service_contracts (organization_id, trade_slug, currency) values ($1,'hvac','EUR')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into service_contracts (organization_id, trade_slug, notice_days) values ($1,'hvac',400)`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into service_contracts (organization_id, trade_slug, annual_value) values ($1,'hvac',-1)`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`update service_contracts set reminder_stage = '30' where id = $1`, [ids.contractA])).rejects.toThrow();
  });

  it("defaults to 60 days notice, CAD and no auto-renewal", async () => {
    const { rows } = await db.query<{ notice_days: number; currency: string; auto_renews: boolean }>(
      `insert into service_contracts (organization_id, trade_slug) values ($1,'hvac') returning notice_days, currency, auto_renews`,
      [ids.orgA],
    );
    expect(rows[0]).toEqual({ notice_days: 60, currency: "CAD", auto_renews: false });
  });

  it("goes when its company goes", async () => {
    const org = randomUUID();
    await db.query(`insert into organizations (id, name, slug, organization_type) values ($1,'Gone','gone-co','property_manager')`, [org]);
    await db.query(`insert into service_contracts (organization_id, trade_slug) values ($1,'hvac')`, [org]);
    await db.query(`delete from organizations where id = $1`, [org]);
    const { rows } = await db.query(`select id from service_contracts where organization_id = $1`, [org]);
    expect(rows).toEqual([]);
  });

  it("adds the digest opt-out to notification preferences, on by default", async () => {
    const { rows } = await db.query<{ column_default: string }>(
      `select column_default from information_schema.columns where table_name = 'notification_preferences' and column_name = 'contract_reminders'`,
    );
    expect(rows[0]?.column_default).toBe("true");
  });

  it("is safe to run twice", async () => {
    const again = await freshDb(2);
    await again.close();
  });
});
