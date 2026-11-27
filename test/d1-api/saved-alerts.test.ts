import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "../../src/lib/d1/contracts";
import { claimD1SavedAlerts, readD1SavedAlerts, unsubscribeD1Opportunities } from "../../src/lib/d1/saved-alerts";

it("checks current preferences when recording each alert and preserves existing unsubscribe settings", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const member = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
  const other = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
  try {
    sqlite.exec(`
      CREATE TABLE _customer_app_authority(id INTEGER PRIMARY KEY,mode TEXT);
      CREATE TABLE rfp_posts(id TEXT PRIMARY KEY,slug TEXT,title TEXT,status TEXT,deadline TEXT,source_type TEXT,closed_at TEXT,updated_at TEXT);
      CREATE TABLE saved_rfps(user_id TEXT,rfp_id TEXT);
      CREATE TABLE users_profile(id TEXT PRIMARY KEY,email TEXT,status TEXT);
      CREATE TABLE notification_preferences(user_id TEXT PRIMARY KEY,new_rfps TEXT,channel_email INTEGER DEFAULT 1,channel_inapp INTEGER DEFAULT 1);
      CREATE TABLE notifications(id TEXT PRIMARY KEY,user_id TEXT,type TEXT,title TEXT,message TEXT,link_url TEXT,created_at TEXT);
      CREATE TABLE _legacy_opportunity_unsubscribe(user_id TEXT,token_sha256 TEXT,PRIMARY KEY(user_id,token_sha256));
      INSERT INTO rfp_posts VALUES
        ('a','closing','Closing fixture','published','2026-11-27',NULL,NULL,'2026-11-25'),
        ('b','ended','Ended fixture','awarded','2026-11-22',NULL,'2026-11-25','2026-11-25'),
        ('c','old','Old fixture','archived','2026-10-12',NULL,'2026-10-20','2026-10-20');
      INSERT INTO users_profile VALUES ('${member}','member@example.invalid','active'),('${other}','other@example.invalid','active');
      INSERT INTO saved_rfps VALUES ('${member}','a'),('${member}','b'),('${member}','c'),('${other}','a');
      INSERT INTO notification_preferences(user_id,new_rfps,channel_email,channel_inapp) VALUES ('${other}','daily',0,0);
      INSERT INTO notifications VALUES ('old','${member}','saved_status:awarded','Past receipt','Previously sent','/rfps/ended','2026-11-25');
    `);
    function prepare(sql: string, params: (string | number | null)[] = []): D1Statement {
      return {
        bind: (...values) => prepare(sql, values),
        async first<T>() { return (sqlite.prepare(sql).get(...params) ?? null) as T | null; },
        async all<T>() {
          const results = sqlite.prepare(sql).all(...params) as T[];
          return { success: true, results, meta: { changes: Number(sqlite.prepare("SELECT changes() n").get()?.n) } };
        },
        async run() { return { success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }; },
      };
    }
    const db: D1Binding = { prepare, async batch<T>(statements: D1Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.all<T>());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }};
    const now = new Date("2026-11-26T12:00:00Z");
    await expect(readD1SavedAlerts(db, now)).rejects.toThrow();
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const { candidates, digests } = await readD1SavedAlerts(db, now);
    expect(candidates).toBe(2);
    expect(digests).toMatchObject([{ userId: member, items: [{ kind: "closing", rfp: { id: "a" } }] }]);
    expect((await claimD1SavedAlerts(db, digests[0], now)).items).toHaveLength(1);
    expect((await claimD1SavedAlerts(db, digests[0], now)).items).toHaveLength(0);
    sqlite.exec("DELETE FROM notifications WHERE type='saved_closing'");
    sqlite.prepare("INSERT INTO _legacy_opportunity_unsubscribe VALUES (?,?)").run(member, "a".repeat(64));
    expect(await unsubscribeD1Opportunities(db, member, "b".repeat(64))).toBe(false);
    expect(await unsubscribeD1Opportunities(db, other, "a".repeat(64))).toBe(false);
    expect(await unsubscribeD1Opportunities(db, member, "a".repeat(64))).toBe(true);
    expect((await claimD1SavedAlerts(db, digests[0], now)).items).toHaveLength(0);
    expect(await readD1SavedAlerts(db, now)).toEqual({ candidates: 2, digests: [] });
    expect(await unsubscribeD1Opportunities(db, other)).toBe(true);
    expect(sqlite.prepare("SELECT new_rfps,channel_email,channel_inapp FROM notification_preferences WHERE user_id=?").get(other))
      .toMatchObject({ new_rfps: "off", channel_email: 0, channel_inapp: 0 });
    expect(await unsubscribeD1Opportunities(db, "00000000-0000-4000-8000-000000000001")).toBe(false);
  } finally {
    sqlite.close();
  }
});
