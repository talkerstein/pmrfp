import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * The tender change log (20261022000300): one row per change the importer
 * sees, unique per listing, field, both values and day; written and read by
 * the service role only; deleted with its listing; the migration re-runs.
 */
const MIGRATION = "20261022000300_rfp_changes.sql";
let db: PGlite;
const rfp = randomUUID();
const user = randomUUID();
const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
const insert = (field: string, oldV: string, newV: string) =>
  db.query(`insert into rfp_changes (rfp_id, slug, field, old_value, new_value, source_key) values ($1, 'snow-clearing-cb-161-1', $2, $3, $4, 'canadabuys')`, [rfp, field, oldV, newV]);

beforeAll(async () => {
  db = await createTestDb([MIGRATION]);
  // Again after the harness's blanket test grants, so the migration's revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  await db.query(`insert into rfp_posts (id, title, slug, status, source_type) values ($1, 'Snow clearing', 'snow-clearing-cb-161-1', 'published', 'public_source')`, [rfp]);
});

afterAll(async () => {
  await db?.close();
});

describe("rfp_changes", () => {
  it("takes the three kinds of change and refuses anything else", async () => {
    await insert("closing_date", "2026-10-18", "2026-10-25");
    await insert("title", "Snow clearing", "Snow clearing and sanding");
    await insert("status", "published", "archived");
    await expect(insert("summary", "a", "b")).rejects.toThrow();
    expect(await rows(`select count(*)::int as n from rfp_changes`)).toEqual([{ n: 3 }]);
  });

  it("records the same change once a day: a repeated import changes nothing", async () => {
    await expect(insert("closing_date", "2026-10-18", "2026-10-25")).rejects.toThrow(/rfp_changes_once_a_day|unique/i);
    // …and the importer's upsert (ignore duplicates) is a no-op rather than an error.
    await db.query(
      `insert into rfp_changes (rfp_id, slug, field, old_value, new_value) values ($1, 'snow-clearing-cb-161-1', 'closing_date', '2026-10-18', '2026-10-25')
       on conflict (rfp_id, field, old_value, new_value, change_day) do nothing`,
      [rfp],
    );
    expect(await rows(`select count(*)::int as n from rfp_changes where field = 'closing_date'`)).toEqual([{ n: 1 }]);
    // A different move is a different row.
    await insert("closing_date", "2026-10-25", "2026-11-01");
    expect(await rows(`select count(*)::int as n from rfp_changes where field = 'closing_date'`)).toEqual([{ n: 2 }]);
  });

  it("is reachable by the service role alone", async () => {
    await expect(asAnon(db, () => db.query(`select * from rfp_changes`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, user, () => db.query(`select * from rfp_changes`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, user, () => db.query(`insert into rfp_changes (rfp_id, slug, field) values ($1, 'x', 'title')`, [rfp]))).rejects.toThrow(/permission denied/);
    const can = await rows(
      `select has_table_privilege('service_role', 'public.rfp_changes', 'select') and has_table_privilege('service_role', 'public.rfp_changes', 'insert')
         and has_table_privilege('service_role', 'public.rfp_changes', 'update') and has_table_privilege('service_role', 'public.rfp_changes', 'delete') as ok`,
    );
    expect(can).toEqual([{ ok: true }]);
    const rls = await rows(`select relrowsecurity as on from pg_class where relname = 'rfp_changes'`);
    expect(rls).toEqual([{ on: true }]);
  });

  it("goes away with its listing", async () => {
    await db.query(`delete from rfp_posts where id = $1`, [rfp]);
    expect(await rows(`select count(*)::int as n from rfp_changes`)).toEqual([{ n: 0 }]);
  });
});
