import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { applyNativeBadgeReward, readNativeBadgeHits, writeNativeBadgeHits } from "@/lib/badge/d1";
import { detectBadgeInstall } from "@/lib/badge/install";
import { planTrialChange, trialAfter } from "@/lib/badge/reward";

vi.mock("@/lib/d1/http-binding", () => ({ vpsAppDatabase: vi.fn() }));

it("aggregates live badge evidence and grants a reward and trial in a single guarded transaction", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const org = { id: "company", slug: "northline", website: "https://northline.ca" };
  const member = { id: "member", organization_id: org.id, email: "owner@northline.ca", primary_role: "trade" };
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
    sqlite.exec(`
      CREATE TABLE _customer_app_authority(id INTEGER PRIMARY KEY,mode TEXT);
      CREATE TABLE organizations(id TEXT PRIMARY KEY,slug TEXT,website TEXT,organization_type TEXT,status TEXT,is_demo INTEGER,profile_status TEXT);
      CREATE TABLE users_profile(id TEXT PRIMARY KEY,email TEXT,primary_role TEXT);
      CREATE TABLE organization_members(organization_id TEXT,user_id TEXT);
      CREATE TABLE subscriptions(organization_id TEXT,status TEXT,tier TEXT,stripe_subscription_id TEXT);
      CREATE TABLE badge_hits(day TEXT,kind TEXT,slug TEXT,referrer TEXT,hits INTEGER,PRIMARY KEY(day,kind,slug,referrer));
      CREATE TABLE badge_rewards(organization_id TEXT PRIMARY KEY,granted_at TEXT,kind TEXT,days INTEGER,domain TEXT,
        distinct_days INTEGER,detected_on TEXT,trial_started_before TEXT,trial_ends_before TEXT,trial_started_after TEXT,trial_ends_after TEXT);
      CREATE TABLE trade_trials(organization_id TEXT PRIMARY KEY,started_at TEXT,ends_at TEXT,source TEXT CHECK(source='badge'));
      INSERT INTO organizations VALUES ('company','northline','https://northline.ca','trade_company','active',0,'approved');
      INSERT INTO users_profile VALUES ('member','owner@northline.ca','trade');
      INSERT INTO organization_members VALUES ('company','member');
    `);
    const hit = { day: "2026-11-26", kind: "listed", slug: org.slug, referrer: "northline.ca", n: 2 };
    await expect(writeNativeBadgeHits([hit])).rejects.toThrow();
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    await writeNativeBadgeHits([hit]);
    await writeNativeBadgeHits([hit, { ...hit, day: "2026-11-27" }]);
    expect(sqlite.prepare("SELECT hits FROM badge_hits ORDER BY day").all()).toEqual([{ hits: 4 }, { hits: 2 }]);
    const install = detectBadgeInstall(org.website, await readNativeBadgeHits([org.slug]), org.slug);
    expect(install.detected).toBe(true);
    const now = new Date("2026-11-27T15:00:00Z");
    const trial = planTrialChange(null, now)!;
    const grant = () => applyNativeBadgeReward(org, install, trial, null, trialAfter(trial, null), now, [member]);
    sqlite.exec("UPDATE users_profile SET primary_role='admin'");
    await expect(grant()).rejects.toThrow();
    sqlite.exec("UPDATE users_profile SET primary_role='trade'");
    sqlite.exec("CREATE TRIGGER block_trial BEFORE INSERT ON trade_trials BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    await expect(grant()).rejects.toThrow();
    expect(sqlite.prepare("SELECT count(*) AS n FROM badge_rewards").get()).toEqual({ n: 0 });
    sqlite.exec("DROP TRIGGER block_trial");
    expect(await grant()).toBe(true);
    await expect(grant()).rejects.toThrow();
    expect(sqlite.prepare("SELECT source,ends_at FROM trade_trials").get())
      .toMatchObject({ source: "badge", ends_at: "2026-12-11T15:00:00.000Z" });
  } finally {
    sqlite.close();
  }
});
