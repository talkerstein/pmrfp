import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { changeVpsBlockedDomain, changeVpsOrganization, nativeOrganizationReviewCounts } from "@/lib/d1/vps-admin-organizations";
import { rescreenVpsOrganizations } from "@/lib/d1/vps-organization-screening";
import { convertVpsVisitor } from "@/lib/d1/vps-visitor-upgrade";
import { recordVpsDuplicateReview, setVpsDuplicateAccountStatus } from "@/lib/d1/vps-duplicate-review";
import { mergeVpsOrganizationPair } from "@/lib/d1/vps-organization-merge";

function binding(sqlite: DatabaseSync): D1Binding {
  const prepare = (sql: string, params: (string | number | null)[] = []): D1Statement => ({
    bind: (...values) => prepare(sql, values),
    first: async <T>() => (sqlite.prepare(sql).get(...params) ?? null) as T | null,
    all: async <T>() => /^SELECT/.test(sql)
      ? { success: true, results: sqlite.prepare(sql).all(...params) as T[], meta: {} }
      : { success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } },
    run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
  });
  return { prepare, async batch<T>(statements: D1Statement[]) {
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
  } };
}

const admin = "1c0493ce-be10-4606-8a87-a46adcd75c23";
const visitor = "a6aca462-a5cf-49c7-8cb8-a037cb0920f1";
const org = "1e04ebb6-4326-4e66-a7ff-8a487a235fb1";

function app() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
  sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
  sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
  for (const [user, role] of [[admin, "admin"], [visitor, "visitor"]]) {
    sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(user);
    sqlite.prepare("INSERT INTO users_profile(id,email,primary_role,onboarding_completed) VALUES(?,?,?,1)")
      .run(user, user + "@example.test", role);
  }
  return sqlite;
}

it("enforces current admin role, allowed organization transitions, and stale-review protection", async () => {
  const sqlite = app();
  try {
    const db = binding(sqlite);
    sqlite.prepare(`INSERT INTO organizations(id,name,slug,profile_status,risk_flagged)
      VALUES(?,'Company','example-company','pending_review',1)`).run(org);
    sqlite.prepare("INSERT INTO organization_risk(organization_id,score,held) VALUES(?,6,1)").run(org);
    expect(await nativeOrganizationReviewCounts(admin, db)).toEqual({ waiting: 1, edited: 0, held: 0 });
    expect(await changeVpsOrganization(visitor, org, { kind: "review", decision: "approved" }, db)).toEqual({ state: "unavailable" });
    sqlite.exec("CREATE TRIGGER block_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'blocked'); END");
    await expect(changeVpsOrganization(admin, org, { kind: "review", decision: "approved" }, db)).rejects.toThrow("blocked");
    expect(sqlite.prepare("SELECT profile_status FROM organizations WHERE id=?").get(org)?.profile_status).toBe("pending_review");
    sqlite.exec("DROP TRIGGER block_audit");
    expect(await changeVpsOrganization(admin, org, { kind: "review", decision: "approved" }, db))
      .toEqual({ state: "changed", slug: "example-company", approved: true });
    expect(await changeVpsOrganization(admin, org, { kind: "review", decision: "rejected" }, db)).toEqual({ state: "unavailable" });
    expect(sqlite.prepare("SELECT decision,decided_by,held FROM organization_risk").get())
      .toMatchObject({ decision: "approved", decided_by: admin, held: 0 });
    const before = sqlite.prepare("SELECT updated_at,approved_at FROM organizations").get();
    expect(before?.approved_at).toEqual(expect.any(String));
    sqlite.prepare("UPDATE organizations SET review_flagged_at=?,review_changes='{}' WHERE id=?")
      .run(before!.updated_at as string, org);
    expect(await changeVpsOrganization(admin, org, { kind: "clear", seen: "older" }, db)).toEqual({ state: "stale" });
    expect(await changeVpsOrganization(admin, org, { kind: "clear", seen: before!.updated_at as string }, db))
      .toMatchObject({ state: "changed", approved: false });
    expect(await changeVpsOrganization(admin, org, { kind: "suspend" }, db)).toMatchObject({ state: "changed" });
    expect(await changeVpsOrganization(admin, org, { kind: "reinstate" }, db)).toMatchObject({ state: "changed" });
    expect(sqlite.prepare("SELECT profile_status,review_flagged_at,approved_at FROM organizations").get())
      .toMatchObject({ profile_status: "approved", review_flagged_at: null, approved_at: before!.approved_at });
    expect(sqlite.prepare("SELECT action FROM audit_logs ORDER BY rowid").all().map(r => r.action))
      .toEqual(["organization.approved", "organization.review_cleared", "organization.suspended", "organization.reinstated"]);
  } finally {
    sqlite.close();
  }
});

it("screens blocked companies without changing a profile status or including trusted companies", async () => {
  const sqlite = app();
  try {
    const db = binding(sqlite);
    sqlite.prepare(`INSERT INTO organizations(id,name,slug,profile_status,organization_type,email)
      VALUES(?,'Paint Company','paint','approved','trade_company','hello@blocked-fixture.ca')`).run(org);
    sqlite.prepare(`INSERT INTO organizations(id,name,slug,profile_status,organization_type,email,link_trusted)
      VALUES('trusted','Trusted','trusted','approved','trade_company','hello@blocked-fixture.ca',1)`).run();
    expect(await changeVpsBlockedDomain(visitor, "blocked-fixture.ca", { reason: null }, db)).toBe(false);
    expect(await changeVpsBlockedDomain(admin, "blocked-fixture.ca", { reason: "Test block" }, db)).toBe(true);
    await expect(rescreenVpsOrganizations(visitor, db)).rejects.toThrow();
    expect(await rescreenVpsOrganizations(admin, db)).toEqual({ checked: 1, flagged: 1, skipped: 1 });
    expect(sqlite.prepare("SELECT profile_status,risk_flagged FROM organizations WHERE id=?").get(org))
      .toMatchObject({ profile_status: "approved", risk_flagged: 1 });
    expect(sqlite.prepare("SELECT blocked,source FROM organization_risk WHERE organization_id=?").get(org))
      .toMatchObject({ blocked: 1, source: "backfill" });
    expect(await changeVpsBlockedDomain(admin, "blocked-fixture.ca", "remove", db)).toBe(true);
    expect(sqlite.prepare("SELECT domain FROM blocked_domains").all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});

it("converts a visitor once and keeps the app role, audit trail, and onboarding preferences in step", async () => {
  const sqlite = app();
  const auth = new DatabaseSync(":memory:");
  try {
    auth.exec("CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE _auth_source_metadata(user_id TEXT PRIMARY KEY,metadata TEXT NOT NULL)");
    auth.prepare("INSERT INTO user VALUES(?)").run(visitor);
    auth.prepare("INSERT INTO _auth_source_metadata VALUES(?,?)").run(visitor, JSON.stringify({ raw_user_meta_data: { other: "kept" } }));
    const db = binding(sqlite);
    const authDb = binding(auth);
    expect(await convertVpsVisitor({ userId: visitor, actorUserId: visitor, to: "supplier", by: "staff" }, db, authDb)).toBe("already");
    expect(await convertVpsVisitor({ userId: visitor, actorUserId: visitor, to: "trade", by: "self", company: "Example" }, db, authDb)).toBe("converted");
    expect(await convertVpsVisitor({ userId: visitor, actorUserId: admin, to: "supplier", by: "staff" }, db, authDb)).toBe("already");
    expect(sqlite.prepare("SELECT primary_role,onboarding_completed FROM users_profile WHERE id=?").get(visitor))
      .toMatchObject({ primary_role: "trade", onboarding_completed: 0 });
    expect(sqlite.prepare("SELECT action,actor_user_id FROM audit_logs").all()).toEqual([{ action: "user.visitor_converted", actor_user_id: visitor }]);
    expect(JSON.parse(String(auth.prepare("SELECT metadata FROM _auth_source_metadata").get()?.metadata)))
      .toMatchObject({ raw_user_meta_data: { other: "kept", primary_role: "trade", pref_company: "Example" } });
  } finally {
    sqlite.close();
    auth.close();
  }
});

it("applies duplicate account bans, revokes sessions, and preserves a separate sign-in restriction", async () => {
  const sqlite = app();
  const auth = new DatabaseSync(":memory:");
  try {
    auth.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,banned INTEGER DEFAULT 0,banExpires TEXT,updatedAt TEXT);
      CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT NOT NULL)`);
    auth.exec(readFileSync("deploy/vps/customer-auth-authority.sql", "utf8"));
    auth.exec("INSERT INTO _auth_native_authority VALUES(1,'native-v1')");
    auth.prepare("INSERT INTO user(id,updatedAt) VALUES(?,?)").run(visitor, "2026-10-01");
    auth.prepare("INSERT INTO session(id,userId) VALUES('session',?)").run(visitor);
    const db = binding(sqlite);
    const authDb = binding(auth);
    expect(await recordVpsDuplicateReview(visitor, "account", visitor, admin, "dismissed", null, db)).toBe(false);
    expect(await setVpsDuplicateAccountStatus(visitor, admin, null, false, db, authDb)).toEqual({ state: "unavailable" });
    expect(await setVpsDuplicateAccountStatus(admin, visitor, null, false, db, authDb)).toMatchObject({ state: "updated" });
    expect(sqlite.prepare("SELECT status FROM users_profile WHERE id=?").get(visitor)?.status).toBe("suspended");
    expect(auth.prepare("SELECT banned FROM user").get()?.banned).toBe(1);
    expect(auth.prepare("SELECT * FROM session").all()).toEqual([]);
    expect(await setVpsDuplicateAccountStatus(admin, visitor, null, true, db, authDb)).toMatchObject({ state: "updated" });
    expect(sqlite.prepare("SELECT status FROM users_profile WHERE id=?").get(visitor)?.status).toBe("active");
    expect(auth.prepare("SELECT banned FROM user").get()?.banned).toBe(0);
    auth.exec("UPDATE user SET banned=1,banExpires='2098-01-01T00:00:00Z'");
    expect(await setVpsDuplicateAccountStatus(admin, visitor, null, false, db, authDb)).toMatchObject({ state: "updated" });
    expect(await setVpsDuplicateAccountStatus(admin, visitor, null, true, db, authDb)).toEqual({ state: "other_ban" });
    expect(auth.prepare("SELECT banExpires FROM user").get()?.banExpires).toBe("2098-01-01T00:00:00Z");
  } finally {
    sqlite.close();
    auth.close();
  }
});

it("archives a duplicate atomically and refuses to orphan a company's private media", async () => {
  const sqlite = app();
  try {
    sqlite.exec(readFileSync("deploy/vps/company-media.sql", "utf8"));
    const newer = "f955298e-8dc6-48b2-94d9-e177ce4da3b1";
    const media = "25c349d3-397c-4ce2-a3c2-c49ccf239f8a";
    const db = binding(sqlite);
    const insert = sqlite.prepare(`INSERT INTO organizations(id,name,slug,organization_type,created_at)
      VALUES(?,?,?,'trade_company',?)`);
    insert.run(org, "Primary", "primary", "2026-10-01T00:00:00Z");
    insert.run(newer, "Duplicate", "duplicate", "2026-10-02T00:00:00Z");
    sqlite.prepare(`INSERT INTO _company_media(id,organization_id,kind,sha256,bytes,created_at,ready)
      VALUES(?,?,'portfolio',?,100,1,1)`).run(media, newer, "a".repeat(64));
    expect(await mergeVpsOrganizationPair(admin, org, newer, db)).toEqual({ state: "protected", records: ["company media"] });
    sqlite.prepare("DELETE FROM _company_media WHERE id=?").run(media);
    sqlite.prepare(`INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('member',?,?,'owner')`).run(newer, visitor);
    expect(await mergeVpsOrganizationPair(visitor, org, newer, db)).toEqual({ state: "unavailable" });
    sqlite.exec("CREATE TRIGGER block_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'blocked'); END");
    await expect(mergeVpsOrganizationPair(admin, org, newer, db)).rejects.toThrow("blocked");
    expect(sqlite.prepare("SELECT organization_id FROM organization_members").get()?.organization_id).toBe(newer);
    sqlite.exec("DROP TRIGGER block_audit");
    expect(await mergeVpsOrganizationPair(admin, org, newer, db)).toEqual({
      state: "merged", primary: "Primary", duplicate: "Duplicate", moved: 1, retained: 0,
    });
    expect(sqlite.prepare("SELECT organization_id,role FROM organization_members").get())
      .toMatchObject({ organization_id: org, role: "owner" });
    expect(sqlite.prepare("SELECT status,merged_into FROM organizations WHERE id=?").get(newer))
      .toMatchObject({ status: "deleted", merged_into: org });
  } finally {
    sqlite.close();
  }
});
