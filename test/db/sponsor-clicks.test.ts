import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, createTestDb } from "./harness";

/** Sponsor click counter (20260925000003): counts per day/sponsor/placement, service role only. */
const MIGRATION = "20260925000003_sponsor_clicks.sql";
let db: PGlite;

beforeAll(async () => {
  db = await createTestDb([MIGRATION]);
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
});

describe("sponsor clicks", () => {
  it("increments one row per day, sponsor, placement and trade", async () => {
    for (let i = 0; i < 3; i++) await db.query(`select public.record_sponsor_click('maple','rfp_detail','electrical')`);
    await db.query(`select public.record_sponsor_click('maple','trade_page','electrical')`);
    const { rows } = await db.query<{ placement: string; clicks: number }>(
      `select placement, clicks from sponsor_clicks where sponsor = 'maple' order by placement`,
    );
    expect(rows).toEqual([
      { placement: "rfp_detail", clicks: 3 },
      { placement: "trade_page", clicks: 1 },
    ]);
  });

  it("can't be called or read by visitors", async () => {
    await expect(asAnon(db, () => db.query(`select public.record_sponsor_click('maple','rfp_detail','')`))).rejects.toThrow();
    const rows = await asAnon(db, async () => (await db.query(`select * from sponsor_clicks`)).rows);
    expect(rows).toHaveLength(0);
  });
});
