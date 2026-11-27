import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "../../src/lib/d1/contracts";
import { keepD1RfpAlive, previewD1RfpExpiry, sweepD1RfpExpiry } from "../../src/lib/d1/rfp-expiry";

it("claims expiry notices only once and keeps eligible listings live without changing sealed or awarded listings", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE _customer_app_authority(id INTEGER PRIMARY KEY, mode TEXT);
      CREATE TABLE users_profile(id TEXT PRIMARY KEY, email TEXT);
      CREATE TABLE rfp_posts(
        id TEXT PRIMARY KEY, title TEXT, slug TEXT, keep_alive_token TEXT UNIQUE, posted_by_user_id TEXT,
        status TEXT, deadline TEXT, expiry_notice_sent_at TEXT, closed_at TEXT, sealed INTEGER
      );
      INSERT INTO users_profile VALUES('owner','owner@example.invalid');
    `);
    const prepare = (sql: string, params: (string | number | null)[] = []): D1Statement => ({
      bind: (...values) => prepare(sql, values),
      first: async <T>() => (sqlite.prepare(sql).get(...params) ?? null) as T | null,
      all: async <T>() => ({
        success: true, results: sqlite.prepare(sql).all(...params) as T[],
        meta: { changes: Number(sqlite.prepare("SELECT changes() AS changes").get()?.changes) },
      }),
      run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
    });
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
    const ids = ["1", "2", "3", "4", "5"].map(n => `b91b7c26-3f35-4328-b2bb-397eff208ca${n}`);
    const insert = sqlite.prepare("INSERT INTO rfp_posts VALUES(?,?,?,?,'owner',?,'2026-11-05',?,NULL,?)");
    insert.run("new", "Newly overdue", "newly-overdue", ids[0], "published", null, 0);
    insert.run("old", "Past grace period", "past-grace", ids[1], "published", "2026-11-08T00:00:00Z", 0);
    insert.run("sealed", "Sealed", "sealed", ids[2], "expired", "2026-11-08T00:00:00Z", 1);
    insert.run("awarded", "Awarded", "awarded", ids[3], "awarded", null, 0);
    insert.run("boundary", "Exactly seven days", "boundary", ids[4], "published", "2026-11-19T00:00:00Z", 0);
    const now = new Date("2026-11-26T00:00:00Z");
    await expect(sweepD1RfpExpiry(db, now)).rejects.toThrow();
    expect(sqlite.prepare("SELECT expiry_notice_sent_at FROM rfp_posts WHERE id='new'").get()?.expiry_notice_sent_at).toBeNull();
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    expect(await previewD1RfpExpiry(db, now)).toEqual({ dry: true, wouldExpire: 1, wouldNotify: 1 });
    expect(sqlite.prepare("SELECT expiry_notice_sent_at FROM rfp_posts WHERE id='new'").get()?.expiry_notice_sent_at).toBeNull();
    expect(sqlite.prepare("SELECT status FROM rfp_posts WHERE id='old'").get()?.status).toBe("published");
    const first = await sweepD1RfpExpiry(db, now);
    expect(first).toMatchObject({ expired: 1, claimed: [{ title: "Newly overdue", email: "owner@example.invalid" }] });
    expect(await sweepD1RfpExpiry(db, now)).toEqual({ expired: 0, claimed: [] });
    expect(await keepD1RfpAlive(db, ids[2], now)).toBe("notlive");
    expect(await keepD1RfpAlive(db, ids[3], now)).toBe("notlive");
    expect(await keepD1RfpAlive(db, "bad-token", now)).toBe("invalid");
    expect(await keepD1RfpAlive(db, ids[1], now)).toBe("ok");
    expect(sqlite.prepare("SELECT status, deadline, expiry_notice_sent_at FROM rfp_posts WHERE id='old'").get())
      .toMatchObject({ status: "published", deadline: "2026-12-26", expiry_notice_sent_at: null });
    expect(sqlite.prepare("SELECT status FROM rfp_posts WHERE id='boundary'").get()?.status).toBe("published");
  } finally {
    sqlite.close();
  }
});
