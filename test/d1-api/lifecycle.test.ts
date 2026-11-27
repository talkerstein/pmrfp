import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { claimD1Lifecycle, finishD1Lifecycle, unsubscribeD1Lifecycle } from "@/lib/lifecycle/d1";

it("gates D1 mail claims, suppresses rejected addresses and keeps lifecycle opt-outs scoped", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const member = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
  const other = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
  const window = {
    now: "2026-11-27T15:00:00Z", todayStart: "2026-11-27T05:00:00Z",
    last24: "2026-11-26T15:00:00Z", maxPerDay: 1,
  };
  function prepare(sql: string, params: (string | number | null)[] = []): D1Statement {
    return {
      bind: (...values) => prepare(sql, values),
      async first<T>() { return (sqlite.prepare(sql).get(...params) ?? null) as T | null; },
      async all<T>() {
        const results = sqlite.prepare(sql).all(...params) as T[];
        return { success: true, results, meta: { changes: Number(sqlite.prepare("SELECT changes() AS n").get()?.n) } };
      },
      async run() { return { success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }; },
    };
  }
  const db: D1Binding = {
    prepare,
    async batch<T>(statements: D1Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all<T>());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    sqlite.exec(`
      CREATE TABLE _customer_app_authority(id INTEGER PRIMARY KEY,mode TEXT);
      CREATE TABLE users_profile(id TEXT PRIMARY KEY,email TEXT,status TEXT,primary_role TEXT,onboarding_completed INTEGER);
      CREATE TABLE notification_preferences(user_id TEXT PRIMARY KEY,new_rfps TEXT DEFAULT 'daily',
        channel_email INTEGER DEFAULT 1,lifecycle_emails INTEGER DEFAULT 1,updated_at TEXT);
      CREATE TABLE organizations(id TEXT PRIMARY KEY,organization_type TEXT,status TEXT,is_demo INTEGER,profile_status TEXT);
      CREATE TABLE organization_members(user_id TEXT,organization_id TEXT);
      CREATE TABLE subscriptions(organization_id TEXT,status TEXT,tier TEXT,stripe_subscription_id TEXT);
      CREATE TABLE digest_subscribers(email_key TEXT PRIMARY KEY,status TEXT,last_sent_at TEXT,updated_at TEXT);
      CREATE TABLE email_suppressions(email_key TEXT PRIMARY KEY,reason TEXT,detail TEXT);
      CREATE TABLE lifecycle_sends(id TEXT PRIMARY KEY,user_id TEXT,organization_id TEXT,step TEXT,status TEXT,lang TEXT,
        sent_at TEXT,detail TEXT,resend_id TEXT,UNIQUE(user_id,step));
      INSERT INTO users_profile VALUES
        ('${member}','member@example.invalid','active','trade',0),
        ('${other}','other@example.invalid','active','trade',1);
      INSERT INTO organizations VALUES ('company','trade_company','active',0,'approved');
      INSERT INTO organization_members VALUES ('${other}','company');
      INSERT INTO notification_preferences(user_id,new_rfps) VALUES ('${other}','weekly');
      INSERT INTO digest_subscribers VALUES ('member@example.invalid','confirmed',NULL,NULL);
    `);
    sqlite.exec(readFileSync("deploy/vps/legacy-lifecycle-unsubscribe.sql", "utf8"));
    const rescue = { userId: member, to: "member@example.invalid", orgId: null, step: "rescue_2h", lang: "en" };
    const welcome = { userId: other, to: "other@example.invalid", orgId: "company", step: "welcome", lang: "en" };
    await expect(claimD1Lifecycle(db, rescue, window)).rejects.toThrow();
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    expect(await claimD1Lifecycle(db, { ...rescue, to: "stale@example.invalid" }, window)).toBeNull();
    const id = await claimD1Lifecycle(db, rescue, window);
    expect(id).toEqual(expect.any(String));
    expect(await claimD1Lifecycle(db, rescue, window)).toBeNull();
    expect(await claimD1Lifecycle(db, { ...rescue, step: "rescue_1d" }, { ...window, maxPerDay: 10 })).toBeNull();
    await finishD1Lifecycle(db, id!, rescue.to, { ok: false, id: null, invalidRecipient: true });
    expect(sqlite.prepare("SELECT status,resend_id FROM lifecycle_sends").get()).toMatchObject({ status: "failed", resend_id: null });
    expect(sqlite.prepare("SELECT status FROM digest_subscribers").get()).toMatchObject({ status: "bounced" });
    expect(await claimD1Lifecycle(db, welcome, window)).toBeNull();
    expect(await claimD1Lifecycle(db, { ...rescue, step: "rescue_1d" }, { ...window, maxPerDay: 10 })).toBeNull();

    const wideWindow = { ...window, maxPerDay: 10 };
    sqlite.exec("INSERT INTO subscriptions VALUES ('company','active','pro','sub_fixture')");
    expect(await claimD1Lifecycle(db, welcome, wideWindow)).toBeNull();
    sqlite.exec("DELETE FROM subscriptions");
    sqlite.prepare("INSERT INTO _legacy_lifecycle_unsubscribe VALUES (?,?)").run(other, "a".repeat(64));
    expect(await unsubscribeD1Lifecycle(db, member, "a".repeat(64))).toBe(false);
    expect(await unsubscribeD1Lifecycle(db, other, "b".repeat(64))).toBe(false);
    expect(await unsubscribeD1Lifecycle(db, other, "a".repeat(64))).toBe(true);
    expect(sqlite.prepare("SELECT new_rfps,channel_email,lifecycle_emails FROM notification_preferences").get())
      .toMatchObject({ new_rfps: "weekly", channel_email: 1, lifecycle_emails: 0 });
    expect(await claimD1Lifecycle(db, welcome, wideWindow)).toBeNull();
  } finally {
    sqlite.close();
  }
});
