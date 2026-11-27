import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createD1HttpBinding } from "../../src/lib/d1/http-binding";
import { purgeD1SiteTracking } from "../../src/lib/d1/site-tracking-retention";

it("preserves the calendar-month cutoff and applies retention atomically only on the serving database", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec(`
      CREATE TABLE site_events (created_at TEXT);
      CREATE TABLE site_visitors (day TEXT);
      CREATE TABLE site_page_views (day TEXT);
      CREATE TABLE site_referrers (day TEXT);
      CREATE TABLE rfp_views (created_at TEXT, visitor_hash TEXT);
      INSERT INTO site_events VALUES ('2025-02-28T11:59:59Z'), ('2025-02-28T12:00:00Z');
      INSERT INTO site_visitors VALUES ('2025-02-27'), ('2025-02-28');
      INSERT INTO site_page_views VALUES ('2025-02-27'), ('2025-02-28');
      INSERT INTO site_referrers VALUES ('2025-02-27'), ('2025-02-28');
      INSERT INTO rfp_views VALUES ('2025-02-28T11:59:59Z', 'visitor'), ('2025-02-28T11:59:59Z', NULL);
      CREATE TRIGGER stop_delete BEFORE DELETE ON rfp_views BEGIN SELECT RAISE(ABORT,'fixture'); END;
    `);
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      const { batch } = await request.json() as { batch: { sql: string; params: string[] }[] };
      expect(batch).toHaveLength(6);
      sqlite.exec("BEGIN");
      try {
        const result = batch.map(({ sql, params }) => ({
          success: true,
          results: sqlite.prepare(sql).all(...params),
          meta: { changes: Number(sqlite.prepare("SELECT changes() AS n").get()?.n) },
        }));
        sqlite.exec("COMMIT");
        return Response.json({ success: true, result });
      } catch {
        sqlite.exec("ROLLBACK");
        return Response.json({ success: false }, { status: 400 });
      }
    };
    const db = createD1HttpBinding("a".repeat(32), "b91b7c26-3f35-4328-b2bb-397eff208ca7", "b".repeat(40), fetcher);
    const now = new Date("2026-03-31T12:00:00Z");
    const tables = ["site_events", "site_visitors", "site_page_views", "site_referrers", "rfp_views"];
    const counts = () => tables.map(table => sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);
    await expect(purgeD1SiteTracking(db, now)).rejects.toMatchObject({ status: 503 });
    expect(counts()).toEqual([2, 2, 2, 2, 2]);
    sqlite.exec("INSERT INTO _customer_app_authority VALUES (1, 'native-v1')");
    expect(await purgeD1SiteTracking(db, now, true)).toEqual({
      cutoff: "2025-02-28T12:00:00.000Z", events: 1, visitors: 1, pages: 1, referrers: 1, views: 1,
    });
    expect(counts()).toEqual([2, 2, 2, 2, 2]);
    await expect(purgeD1SiteTracking(db, now)).rejects.toMatchObject({ status: 503 });
    expect(counts()).toEqual([2, 2, 2, 2, 2]);
    sqlite.exec("DROP TRIGGER stop_delete");
    expect(await purgeD1SiteTracking(db, now)).toEqual({
      cutoff: "2025-02-28T12:00:00.000Z", events: 1, visitors: 1, pages: 1, referrers: 1, views: 1,
    });
    expect(counts()).toEqual([1, 1, 1, 1, 1]);
    expect(sqlite.prepare("SELECT visitor_hash FROM rfp_views").get()?.visitor_hash).toBeNull();
  } finally {
    sqlite.close();
  }
});
