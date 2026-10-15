import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/** Sign-up attribution + landing counters (20261015000001): admins read, service role writes. */
const MIGRATION = "20261015000001_signup_attribution.sql";
let db: PGlite;
const ids = { admin: randomUUID(), member: randomUUID() };

beforeAll(async () => {
  db = await createTestDb([MIGRATION]);
  // Again after the harness's blanket test grants, so the migration's revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  for (const [id, name] of [[ids.admin, "Root"], [ids.member, "Member"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name.toLowerCase()}@example.com`, JSON.stringify({ full_name: name })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(
    `insert into signup_attribution (user_id, channel, landing_path, referrer_host, utm_source, first_seen, lang, country, method)
     values ($1, 'google_organic', '/rfps', 'google.com', null, '2026-10-14', 'en', 'CA', 'email')`,
    [ids.member],
  );
});

const rows = async (sql: string) => (await db.query(sql)).rows;

describe("signup_attribution", () => {
  it("only admins can read it", async () => {
    expect(await asUser(db, ids.admin, () => rows(`select user_id from signup_attribution`))).toHaveLength(1);
    expect(await asUser(db, ids.member, () => rows(`select user_id from signup_attribution`))).toHaveLength(0);
    await expect(asAnon(db, () => rows(`select user_id from signup_attribution`))).rejects.toThrow(/permission denied/);
  });

  it("members can't write or rewrite their own source", async () => {
    await expect(
      asUser(db, ids.member, () => db.query(`insert into signup_attribution (user_id, channel) values ($1, 'paid')`, [ids.admin])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.member, () => db.query(`update signup_attribution set channel = 'paid' where user_id = $1`, [ids.member])),
    ).rejects.toThrow(/permission denied/);
    const { rows: r } = await db.query<{ channel: string }>(`select channel from signup_attribution where user_id = $1`, [ids.member]);
    expect(r[0].channel).toBe("google_organic");
  });

  it("rejects full URLs, unknown channels and IP-like countries", async () => {
    await expect(db.query(`insert into signup_attribution (user_id, channel) values ($1, 'carrier-pigeon')`, [ids.admin])).rejects.toThrow();
    await expect(db.query(`insert into signup_attribution (user_id, referrer_host) values ($1, 'https://google.com/search?q=x')`, [ids.admin])).rejects.toThrow();
    await expect(db.query(`insert into signup_attribution (user_id, country) values ($1, '10.0.0.1')`, [ids.admin])).rejects.toThrow();
    await expect(db.query(`insert into signup_attribution (user_id, landing_path) values ($1, 'rfps')`, [ids.admin])).rejects.toThrow();
  });
});

describe("landing_counts", () => {
  it("record_landings sums a batch into daily rows", async () => {
    const batch = JSON.stringify([
      { day: "2026-10-15", channel: "google_organic", path: "/rfps", n: 3 },
      { day: "2026-10-15", channel: "google_organic", path: "/rfps", n: 2 },
      { day: "2026-10-15", channel: "direct", path: "/", n: 1 },
      { day: "2026-10-15", channel: "", path: "/ignored", n: 9 },
    ]);
    await db.query(`select public.record_landings($1::jsonb)`, [batch]);
    await db.query(`select public.record_landings($1::jsonb)`, [JSON.stringify([{ day: "2026-10-15", channel: "direct", path: "/", n: 4 }])]);
    const { rows: r } = await db.query<{ channel: string; landing_path: string; visits: number }>(
      `select channel, landing_path, visits from landing_counts order by channel`,
    );
    expect(r).toEqual([
      { channel: "direct", landing_path: "/", visits: 5 },
      { channel: "google_organic", landing_path: "/rfps", visits: 5 },
    ]);
  });

  it("visitors can't call it or read the counts; admins can read", async () => {
    await expect(asAnon(db, () => db.query(`select public.record_landings('[]'::jsonb)`))).rejects.toThrow();
    await expect(asAnon(db, () => rows(`select * from landing_counts`))).rejects.toThrow(/permission denied/);
    expect(await asUser(db, ids.member, () => rows(`select * from landing_counts`))).toHaveLength(0);
    expect(await asUser(db, ids.admin, () => rows(`select * from landing_counts`))).toHaveLength(2);
  });
});
