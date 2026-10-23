import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Open data, batch 1 (20261023000100): the new tables are server-only (RLS on,
 * no policies), upserts are idempotent on the source's id, award_history gains
 * the non-competitive flag, the Intel slice returns it, and the migration re-runs.
 */
const INTEL = "20261017000001_intel_access.sql";
const AWARDS = "20261017000040_award_history.sql";
const MIGRATION = "20261023000100_open_data_batch1.sql";
let db: PGlite;
const user = randomUUID();
const rows = async (sql: string) => (await db.query(sql)).rows;

beforeAll(async () => {
  db = await createTestDb([INTEL, AWARDS, MIGRATION]);
  // Again after the harness's blanket test grants, so the migration's revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ivy@example.com', '{}')`, [user]);
});

afterAll(async () => {
  await db?.close();
});

const lead = (key: string, value = 250000) =>
  db.query(
    `insert into permit_leads (source, source_key, city, province, issued_on, value_cad, contractor, contractor_key, work_type, as_of)
     values ('permits-lead-test', $1, 'Testville', 'Ontario', '2026-05-01', $2, 'Acme Roofing Ltd', 'acme roofing', 'New', '2026-10-23')
     on conflict (source, source_key) do update set value_cad = excluded.value_cad`,
    [key, value],
  );

describe("open data batch 1", () => {
  it("permit_leads upserts on (source, source_key) and checks its columns", async () => {
    await lead("P-1");
    await lead("P-1", 300000);
    await lead("P-2");
    expect(await rows(`select source_key, value_cad::int as v from permit_leads order by source_key`)).toEqual([
      { source_key: "P-1", v: 300000 },
      { source_key: "P-2", v: 250000 },
    ]);
    await expect(db.query(`insert into permit_leads (source, source_key, city, province, issued_on, value_cad, contractor, contractor_key, as_of) values ('Bad Source', 'x', 'T', 'Ontario', '2026-01-01', 1, 'Acme Ltd', 'acme', '2026-01-01')`)).rejects.toThrow();
    await expect(db.query(`insert into permit_leads (source, source_key, city, province, issued_on, value_cad, contractor, contractor_key, as_of) values ('permits-lead-test', 'y', 'T', 'Ontario', '2026-01-01', -5, 'Acme Ltd', 'acme', '2026-01-01')`)).rejects.toThrow();
  });

  it("the new tables are invisible to anon and signed-in users (server only)", async () => {
    for (const table of ["permit_leads", "contractor_activity", "planned_procurements", "open_data_runs"]) {
      await expect(asAnon(db, () => rows(`select * from ${table}`)), table).rejects.toThrow(/permission denied/);
      await expect(asUser(db, user, () => rows(`select * from ${table}`)), table).rejects.toThrow(/permission denied/);
    }
  });

  it("contractor_activity is unique per source, city, trade and contractor; declared value may be empty", async () => {
    const ins = () =>
      db.query(`insert into contractor_activity (source, city, province, trade_slug, rank, contractor, contractor_key, permits, window_start, window_end, as_of) values ('calgary-trade-permits', 'Calgary', 'Alberta', 'hvac', 1, 'Drive Mechanical', 'drive mechanical', 628, '2025-10-23', '2026-10-23', '2026-10-23')`);
    await ins();
    await expect(ins()).rejects.toThrow();
  });

  it("planned_procurements takes the Toronto pipeline shape", async () => {
    await db.query(`insert into planned_procurements (source, source_key, buyer_key, buyer_name, city, province, title, sourcing_year, estimated_range, licence, as_of) values ('toronto-capital-pipeline', '1|x', 'city of toronto', 'City of Toronto', 'Toronto', 'Ontario', 'Dufferin Transfer Station', 2026, 'Up to $5M', 'OGL-Toronto', '2026-10-23')`);
    expect(await rows(`select count(*)::int as n from planned_procurements where buyer_key = 'city of toronto'`)).toEqual([{ n: 1 }]);
  });

  it("award_history takes the non-competitive flag (default false) and the intel slice returns it", async () => {
    await db.query(
      `insert into award_history (source, source_key, title, winner_business_name, winner_key, value, currency, country, award_date, licence, attribution, as_of, non_competitive, procurement_method)
       values ('ca-toronto-noncompetitive', 'ws1|acme', 'Toronto Water: non-competitive contract (Emergency)', 'Acme Ltd', 'acme', 67000, 'CAD', 'CA', '2026-03-01', 'OGL-Toronto', 'a', '2026-10-23', true, 'non-competitive (Emergency)'),
              ('ca-seao', 'k1', 'Snow removal', 'Zed Inc', 'zed', 1000, 'CAD', 'CA', '2026-03-02', 'CC BY', 'a', '2026-10-23', false, null)`,
    );
    const r = await db.query<{ s: { source: string; non_competitive: boolean; procurement_method: string | null }[] }>(`select public.award_history_intel_slice('CA', '2025-01-01', 10) as s`);
    const bySource = Object.fromEntries(r.rows[0].s.map((x) => [x.source, x]));
    expect(bySource["ca-toronto-noncompetitive"]).toMatchObject({ non_competitive: true, procurement_method: "non-competitive (Emergency)" });
    expect(bySource["ca-seao"]).toMatchObject({ non_competitive: false, procurement_method: null });
    expect(await rows(`select count(*)::int as n from award_history where non_competitive = false`)).toEqual([{ n: 1 }]);
  });

  it("open_data_footprint() measures rows and bytes per table and per award source", async () => {
    const r = await db.query<{ f: { tables: Record<string, { rows: number; bytes: number }>; award_history_by_source: Record<string, { rows: number; heap_bytes: number }> } }>(`select public.open_data_footprint() as f`);
    const f = r.rows[0].f;
    expect(f.tables.permit_leads.rows).toBe(2);
    expect(f.tables.permit_leads.bytes).toBeGreaterThan(0);
    expect(f.award_history_by_source["ca-toronto-noncompetitive"].rows).toBe(1);
    expect(f.award_history_by_source["ca-toronto-noncompetitive"].heap_bytes).toBeGreaterThan(100);
  });
});
