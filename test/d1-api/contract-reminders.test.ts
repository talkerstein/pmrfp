import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { sendTownJobEmail } from "@/lib/email/send";
import { runD1ContractReminders, unsubscribeD1Contract } from "@/lib/contracts/d1-reminders";

vi.mock("@/lib/d1/http-binding", () => ({ vpsAppDatabase: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendTownJobEmail: vi.fn() }));

it("previews D1 renewal digests, respects suppression and claims each reminder stage once", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const member = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
  const suppressed = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
  const now = new Date("2026-11-27T15:00:00Z");
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
  vi.mocked(vpsAppDatabase).mockReturnValue(db as ReturnType<typeof vpsAppDatabase>);
  try {
    vi.stubEnv("PMRFP_SMTP_ENABLED", "enabled");
    vi.stubEnv("PMRFP_SMTP_USER", "info@pmrfp.com");
    vi.stubEnv("PMRFP_SMTP_PASSWORD", "fixture");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "fixture-only");
    sqlite.exec(`
      CREATE TABLE _customer_app_authority(id INTEGER PRIMARY KEY,mode TEXT);
      CREATE TABLE users_profile(id TEXT PRIMARY KEY,email TEXT,status TEXT);
      CREATE TABLE notification_preferences(user_id TEXT PRIMARY KEY,contract_reminders INTEGER DEFAULT 1,
        channel_email INTEGER DEFAULT 1,new_rfps TEXT DEFAULT 'daily',updated_at TEXT);
      CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT,province TEXT,country TEXT);
      CREATE TABLE organization_members(user_id TEXT,organization_id TEXT);
      CREATE TABLE signup_attribution(user_id TEXT,lang TEXT);
      CREATE TABLE trade_categories(slug TEXT,name TEXT);
      CREATE TABLE email_suppressions(email_key TEXT PRIMARY KEY);
      CREATE TABLE service_contracts(id TEXT PRIMARY KEY,organization_id TEXT,building_name TEXT,trade_slug TEXT,
        service_detail TEXT,vendor_name TEXT,start_date TEXT,end_date TEXT,auto_renews INTEGER,notice_days INTEGER,
        retender_rfp_id TEXT,reminder_stage TEXT,reminder_for TEXT);
      INSERT INTO _customer_app_authority VALUES (1,'native-v1');
      INSERT INTO organizations VALUES ('company','Example Property Management','Ontario','CA');
      INSERT INTO users_profile VALUES ('${member}','owner@example.invalid','active'),('${suppressed}','hidden@example.invalid','active');
      INSERT INTO organization_members VALUES ('${member}','company'),('${suppressed}','company');
      INSERT INTO notification_preferences(user_id,new_rfps) VALUES ('${member}','weekly');
      INSERT INTO email_suppressions VALUES ('hidden@example.invalid');
      INSERT INTO service_contracts VALUES ('annual','company','Main Building',NULL,'Roof maintenance',NULL,
        '2025-12-11','2026-12-11',0,30,NULL,NULL,NULL);
    `);
    sqlite.exec(readFileSync("deploy/vps/legacy-contract-unsubscribe.sql", "utf8"));
    const dry = await runD1ContractReminders({ dry: true, now });
    expect(dry).toMatchObject({ ready: true, dry: true, contracts: 1, digests: 1 });
    expect(sqlite.prepare("SELECT reminder_stage FROM service_contracts").get()).toEqual({ reminder_stage: null });
    expect(sendTownJobEmail).not.toHaveBeenCalled();
    const sent = await runD1ContractReminders({ dry: false, now });
    expect(sent).toMatchObject({ ready: true, contracts: 1, digests: 1, failed: 0 });
    expect(sendTownJobEmail).toHaveBeenCalledExactlyOnceWith("owner@example.invalid", expect.any(Object), "en",
      "contract-renewal-digest", expect.stringContaining("/api/email/contract-unsubscribe"), { smtpOnly: true });
    expect(await runD1ContractReminders({ dry: false, now })).toMatchObject({ contracts: 0, digests: 0 });
    expect(await unsubscribeD1Contract(member, "a".repeat(64))).toBe(false);
    sqlite.prepare("INSERT INTO _legacy_contract_unsubscribe VALUES (?,?)").run(member, "a".repeat(64));
    expect(await unsubscribeD1Contract(member, "a".repeat(64))).toBe(true);
    expect(sqlite.prepare("SELECT contract_reminders,channel_email,new_rfps FROM notification_preferences").get())
      .toMatchObject({ contract_reminders: 0, channel_email: 1, new_rfps: "weekly" });
  } finally {
    vi.unstubAllEnvs();
    sqlite.close();
  }
});
