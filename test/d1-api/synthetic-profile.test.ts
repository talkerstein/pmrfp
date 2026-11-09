import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { D1Binding, D1Result, D1Statement } from "../../src/lib/d1/contracts";
import { handleRequest, type Env } from "../../workers/d1-api";

const accountId = "00000000-0000-4000-8000-000000000018";
const otherId = "00000000-0000-4000-8000-000000000019";
const email = "first-profile@example.invalid";
const gateway = "synthetic-profile-gateway-at-least-32";
const token = "__Secure-better-auth.session_token=synthetic.fixture.cookie";
let sqlite: DatabaseSync;
let env: Env;

function prepare(sql: string, values: (string | number | null)[] = []): D1Statement {
  return {
    bind: (...bound) => prepare(sql, bound),
    first: async <T>() => (sqlite.prepare(sql).get(...values) ?? null) as T | null,
    all: async <T>() => ({
      success: true,
      results: sqlite.prepare(sql).all(...values) as T[],
      meta: { changes: Number(sqlite.prepare("SELECT changes() AS n").get()?.n) },
    }),
    run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  };
}

const binding: D1Binding = {
  prepare,
  async batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]> {
    sqlite.exec("BEGIN IMMEDIATE");
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

const auth = (id = accountId, verified = true): typeof fetch => async () => Response.json({
  user: { id, email, emailVerified: verified, banned: false, role: "super_admin" },
  session: { userId: id, expiresAt: "2099-01-01T00:00:00Z" },
});

function request(body: unknown, options: { config?: Env; session?: string; auth?: typeof fetch } = {}) {
  return handleRequest(new Request("https://sandbox.invalid/v1/profile", {
    method: "POST",
    headers: { "content-type": "application/json", "x-pmrfp-gateway-key": gateway, "x-pmrfp-native-session": options.session ?? token },
    body: JSON.stringify(body),
  }), options.config ?? env, options.auth ?? auth());
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
  sqlite.exec("CREATE TABLE _d1_sandbox(key TEXT PRIMARY KEY,value TEXT); INSERT INTO _d1_sandbox VALUES('dataset','synthetic-only')");
  env = {
    DB: binding,
    GATEWAY_SECRET: gateway,
    AUTH_PROVIDER: "native-synthetic",
    NATIVE_PROFILE_MODE: "sandbox-write",
    NATIVE_AUTH_URL: "https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev",
    NATIVE_AUTH_GATEWAY_SECRET: "synthetic-auth-gateway-at-least-32",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
  };
});
afterEach(() => sqlite.close());

it("provisions a verified identity exactly once and keeps the original role on retry", async () => {
  const first = await request({ role: "trade", fullName: "  Fixture User  " });
  expect(first.status).toBe(201);
  expect(await first.json()).toEqual({ created: true });
  const retry = await request({ role: "property_manager", fullName: "Changed" });
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ created: false });
  expect(sqlite.prepare("SELECT id,email,primary_role,full_name,onboarding_completed FROM users_profile").get())
    .toEqual({ id: accountId, email, primary_role: "trade", full_name: "Fixture User", onboarding_completed: 0 });
  sqlite.exec("UPDATE users_profile SET status='suspended'");
  expect((await request({ role: "trade" })).status).toBe(403);
  expect(sqlite.prepare("SELECT status FROM users_profile").get()?.status).toBe("suspended");
});

it("rejects a duplicate email and rolls back the identity reference if profile insertion fails", async () => {
  sqlite.prepare("INSERT INTO _auth_users VALUES(?)").run(otherId);
  sqlite.prepare("INSERT INTO users_profile(id,email) VALUES(?,?)").run(otherId, email.toUpperCase());
  expect((await request({ role: "trade" })).status).toBe(409);
  expect(sqlite.prepare("SELECT id FROM _auth_users").all()).toEqual([{ id: otherId }]);

  sqlite.exec("DELETE FROM users_profile; CREATE TRIGGER fixture_reject BEFORE INSERT ON users_profile BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  expect((await request({ role: "trade" })).status).toBe(503);
  expect(sqlite.prepare("SELECT id FROM _auth_users").all()).toEqual([{ id: otherId }]);
  expect(sqlite.prepare("SELECT id FROM users_profile").all()).toEqual([]);
});

it("requires the isolated marker and a verified session and rejects privileged or injected input", async () => {
  expect((await request({ role: "admin" })).status).toBe(400);
  expect((await request({ role: "trade", email: "other@example.invalid" })).status).toBe(400);
  expect((await request({ role: "trade" }, { auth: auth(accountId, false) })).status).toBe(401);
  expect((await request({ role: "trade" }, { session: "" })).status).toBe(401);
  const transport = vi.fn<typeof fetch>();
  expect((await request({ role: "trade" }, { config: { ...env, NATIVE_PROFILE_MODE: undefined }, auth: transport })).status).toBe(404);
  sqlite.exec("DELETE FROM _d1_sandbox");
  expect((await request({ role: "trade" }, { auth: transport })).status).toBe(503);
  expect(transport).not.toHaveBeenCalled();
  expect(sqlite.prepare("SELECT id FROM _auth_users").all()).toEqual([]);
});

it("uses the verified account's signup intent and commits profile, notice and attribution together", async () => {
  const signedUpAt = "2026-11-09T07:00:00.000Z";
  const signupIntent = {
    fullName: "Original Name", role: "supplier", lang: "fr", method: "password", optedOut: false, signedUpAt,
    firstTouch: "v=1&p=%2Ffr%2Frfps&r=google.com&d=2026-11-08&l=fr",
    noticeVersion: "2026-10-22.1",
  };
  const transport: typeof fetch = async (url) => {
    expect(String(url)).toMatch(/\/__migration\/signup-intent$/);
    const session = await (await auth()(url)).json();
    return Response.json({ ...session, signupIntent });
  };
  const options = { config: { ...env, NATIVE_PROFILE_MODE: "sandbox-signup-intent" } as Env, auth: transport };
  expect((await request({ role: "admin" }, options)).status).toBe(400);
  sqlite.exec("CREATE TRIGGER fixture_reject BEFORE INSERT ON signup_attribution BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  expect((await request({}, options)).status).toBe(503);
  for (const table of ["_auth_users", "users_profile", "email_consents", "signup_attribution"]) {
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n).toBe(0);
  }
  sqlite.exec("DROP TRIGGER fixture_reject");
  expect((await request({}, options)).status).toBe(201);
  expect((await request({}, options)).status).toBe(200);
  expect(sqlite.prepare("SELECT id,primary_role,full_name FROM users_profile").all())
    .toEqual([{ id: accountId, primary_role: "supplier", full_name: "Original Name" }]);
  expect(sqlite.prepare("SELECT scope,source,wording_version,lang,created_at FROM email_consents").all())
    .toEqual([{ scope: "service", source: "signup_form", wording_version: signupIntent.noticeVersion, lang: "fr", created_at: signedUpAt }]);
  expect(sqlite.prepare("SELECT method,role,lang,channel,landing_path,signed_up_at FROM signup_attribution").all())
    .toEqual([{ method: "password", role: "supplier", lang: "fr", channel: "google_organic", landing_path: "/fr/rfps", signed_up_at: signedUpAt }]);
});

it("lets a verified profile respond and rolls back the response when its notification cannot be recorded", async () => {
  expect((await request({ role: "trade" })).status).toBe(201);
  const org = "30000000-0000-4000-8000-000000000001";
  const rfp = "10000000-0000-4000-8000-000000000001";
  sqlite.exec(readFileSync("workers/d1-api/interest-sandbox.sql", "utf8"));
  sqlite.prepare("INSERT INTO _auth_users VALUES(?)").run(otherId);
  sqlite.prepare("INSERT INTO users_profile(id,email) VALUES(?,?)").run(otherId, "poster@example.invalid");
  sqlite.prepare("INSERT INTO organizations(id,name,slug,organization_type,profile_status) VALUES(?,?,?,'trade_company','approved')")
    .run(org, "Fixture Trade", "fixture-trade");
  sqlite.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES(?,?,?,'owner')")
    .run("40000000-0000-4000-8000-000000000001", org, accountId);
  sqlite.prepare(`INSERT INTO rfp_posts(id,title,slug,status,keep_alive_token,source_type,posted_by_user_id)
    VALUES(?,?,?,'published',?,'property_manager_direct',?)`).run(rfp, "Fixture Job", "fixture-job", "fixture-token", otherId);
  const submit = (config: Env) => handleRequest(new Request("https://sandbox.invalid/v1/rfp-interest", {
    method: "POST",
    headers: { "content-type": "application/json", "x-pmrfp-gateway-key": gateway, "x-pmrfp-native-session": token },
    body: JSON.stringify({ rfpId: rfp, message: "Fixture response", acceptDisclaimer: true }),
  }), config, auth());
  expect((await submit(env)).status).toBe(404);
  const enabled: Env = { ...env, NATIVE_INTEREST_MODE: "sandbox-write" };
  sqlite.exec("CREATE TRIGGER fixture_skip_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(IGNORE); END");
  expect((await submit(enabled)).status).toBe(503);
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM rfp_interests").get()?.n).toBe(0);
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM _d1_interest_outbox").get()?.n).toBe(0);
  sqlite.exec("DROP TRIGGER fixture_skip_notice");
  const response = await submit(enabled);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true, allowance: { unlimited: false, left: 2, limit: 3 } });
  expect((await submit(enabled)).status).toBe(409);
  expect(sqlite.prepare("SELECT user_id,type FROM notifications").all()).toEqual([{ user_id: otherId, type: "pm_new_response" }]);

  sqlite.prepare("UPDATE users_profile SET primary_role='property_manager' WHERE id=?").run(otherId);
  sqlite.prepare("UPDATE organizations SET email=?,public_contact_visibility='hide_contact' WHERE id=?")
    .run("private-trade@example.invalid", org);
  const buyerRead = (actor: string) => handleRequest(new Request("https://sandbox.invalid/v1/rfp-responses?rfpId=" + rfp, {
    headers: { "x-pmrfp-gateway-key": gateway, "x-pmrfp-native-session": token },
  }), enabled, auth(actor));
  expect((await buyerRead(accountId)).status).toBe(404);
  const hidden = await buyerRead(otherId);
  expect(hidden.status).toBe(200);
  expect((await hidden.json()).items[0]).toMatchObject({ message: "Fixture response", contact: null });
  sqlite.exec("UPDATE rfp_interests SET contact_revealed=1");
  const shared = await buyerRead(otherId);
  expect((await shared.json()).items[0].contact.email).toBe("private-trade@example.invalid");
  sqlite.prepare("UPDATE users_profile SET status='suspended' WHERE id=?").run(otherId);
  expect((await buyerRead(otherId)).status).toBe(404);
});
