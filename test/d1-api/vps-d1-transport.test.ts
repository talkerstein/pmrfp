import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "../../src/lib/d1/contracts";
import { vpsDatabase } from "../../src/lib/d1/http-binding";
import { handleVpsD1Transport } from "../../workers/d1-api/vps-d1-transport";

it("restricts the fixed D1 bindings to the VPS and keeps candidate reads and writes gated", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const key = "a".repeat(64);
  const ip = "192.0.2.1";
  try {
    sqlite.exec(`
      CREATE TABLE _customer_app_authority(id INTEGER PRIMARY KEY, mode TEXT);
      CREATE TABLE _auth_native_authority(id INTEGER PRIMARY KEY, mode TEXT);
      CREATE TABLE notes(value TEXT);
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
        const results = [];
        for (const statement of statements) results.push(await statement.all<T>());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }};
    const env = { AUTH_DB: db, APP_DB: db, VPS_D1_KEY: key, VPS_IP: ip, MODE: "readiness" as "readiness" | "serving" };
    const origin = "https://pmrfp-vps-d1-transport.pmrfp.workers.dev";
    const health = (clientIp: string, token = key) => handleVpsD1Transport(new Request(origin + "/v1/app/health", {
      headers: { "cf-connecting-ip": clientIp, authorization: `Bearer ${token}` },
    }), env);
    expect((await health("192.0.2.2")).status).toBe(404);
    expect((await health(ip, "b".repeat(64))).status).toBe(401);
    expect(await (await health(ip)).json()).toEqual({ database: "app", reachable: true, ready: false });

    const fetcher: typeof fetch = async (input, init) => {
      const req = new Request(input, init);
      req.headers.set("cf-connecting-ip", ip);
      expect(new URL(req.url).origin).toBe(origin);
      return handleVpsD1Transport(req, env);
    };
    const app = vpsDatabase("app", { PMRFP_VPS_D1_TRANSPORT_KEY: key }, fetcher);
    const auth = vpsDatabase("auth", { PMRFP_VPS_D1_TRANSPORT_KEY: key }, fetcher);
    const insert = app.prepare("INSERT INTO notes VALUES (?)").bind("fixture");
    await expect(insert.run()).rejects.toMatchObject({ status: 503 });
    env.MODE = "serving";
    await expect(insert.run()).rejects.toMatchObject({ status: 503 });
    sqlite.exec("INSERT INTO _customer_app_authority VALUES (1,'native-v1')");
    await expect(auth.prepare("SELECT value FROM notes").first()).rejects.toMatchObject({ status: 503 });
    await expect(app.prepare("SELECT value FROM notes; DELETE FROM notes").first()).rejects.toMatchObject({ status: 503 });
    await expect(app.batch([insert, app.prepare("INSERT INTO missing_table VALUES (?)").bind("fixture")])).rejects.toMatchObject({ status: 503 });
    expect(sqlite.prepare("SELECT value FROM notes").get()).toBeUndefined();
    const [, result] = await app.batch([insert, app.prepare("SELECT value FROM notes")]);
    expect(result.results).toEqual([{ value: "fixture" }]);
    expect(await (await health(ip)).json()).toMatchObject({ ready: true });
    sqlite.exec("INSERT INTO _auth_native_authority VALUES (1,'native-v1')");
    expect(await auth.prepare('PRAGMA table_info("notes")').first()).toMatchObject({ name: "value" });
    await expect(app.prepare("PRAGMA table_info('notes')").first()).rejects.toMatchObject({ status: 503 });
    await expect(auth.prepare("PRAGMA writable_schema=1").first()).rejects.toMatchObject({ status: 503 });
  } finally {
    sqlite.close();
  }
});
