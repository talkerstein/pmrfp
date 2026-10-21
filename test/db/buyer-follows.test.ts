import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Follow a buyer or town (20261021000110): one row per person per page,
 * people read only their own follows (RLS), nobody writes through the API,
 * follow_buyer() enforces the free limit (3) and is the service role's
 * alone, the counts view shows numbers only, and the migration re-runs.
 */
const MIGRATION = "20261021000110_buyer_follows.sql";
let db: PGlite;
const ids = { a: randomUUID(), b: randomUUID(), pro: randomUUID(), org: randomUUID() };
const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
const follow = async (user: string, key: string, limit: number | null) =>
  ((await rows(`select public.follow_buyer($1, $2, $3, $4) as r`, [user, ids.org, key, limit])) as { r: string }[])[0].r;

beforeAll(async () => {
  db = await createTestDb([MIGRATION]);
  // Again after the harness's blanket test grants, so the migration's revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  for (const [id, email] of [[ids.a, "a@roofs.ca"], [ids.b, "b@hvac.ca"], [ids.pro, "pro@paving.ca"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [id, email]);
  }
  await db.query(`insert into organizations (id, name, slug, organization_type) values ($1, 'Roofs Inc', 'roofs-inc-x1', 'trade_company')`, [ids.org]);
});

afterAll(async () => {
  await db?.close();
});

describe("follow_buyer(): the free limit, in the database", () => {
  it("lets a free account follow 3 buyers, then refuses the 4th", async () => {
    for (const key of ["ontario/town-of-cobourg", "ontario/city-of-guelph", "ontario/township-of-wellington-north"]) expect(await follow(ids.a, key, 3)).toBe("followed");
    expect(await follow(ids.a, "ontario/town-of-cochrane", 3)).toBe("limit");
    expect(await follow(ids.a, "ontario/town-of-cobourg", 3)).toBe("already");
    expect(await rows(`select count(*)::int as n from buyer_follows where user_id = $1`, [ids.a])).toEqual([{ n: 3 }]);
  });

  it("is unlimited for Trade Pro and trial (no limit passed)", async () => {
    for (let i = 0; i < 6; i++) expect(await follow(ids.pro, `ontario/buyer-${i}`, null)).toBe("followed");
    expect(await rows(`select count(*)::int as n from buyer_follows where user_id = $1`, [ids.pro])).toEqual([{ n: 6 }]);
  });

  it("keeps one row per person per page and only real page keys", async () => {
    await expect(db.query(`insert into buyer_follows (user_id, buyer_slug) values ($1, 'ontario/town-of-cobourg')`, [ids.a])).rejects.toThrow();
    await expect(db.query(`insert into buyer_follows (user_id, buyer_slug) values ($1, 'Not A Key')`, [ids.b])).rejects.toThrow();
  });

  it("only the service role can call it", async () => {
    await expect(asUser(db, ids.b, () => rows(`select public.follow_buyer($1, null, 'ontario/x', null)`, [ids.b]))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => rows(`select public.follow_buyer($1, null, 'ontario/x', null)`, [ids.b]))).rejects.toThrow(/permission denied/);
  });
});

describe("RLS: people read their own follows, nobody else's", () => {
  it("a person sees only their own rows", async () => {
    await follow(ids.b, "ontario/town-of-cobourg", 3);
    const mine = (await asUser(db, ids.b, () => rows(`select user_id, buyer_slug from buyer_follows order by buyer_slug`))) as { user_id: string }[];
    expect(mine).toEqual([{ user_id: ids.b, buyer_slug: "ontario/town-of-cobourg" }]);
    const others = await asUser(db, ids.b, () => rows(`select 1 from buyer_follows where user_id = $1`, [ids.a]));
    expect(others).toEqual([]);
  });

  it("anon reads nothing; nobody writes through the API", async () => {
    await expect(asAnon(db, () => rows(`select * from buyer_follows`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.b, () => rows(`insert into buyer_follows (user_id, buyer_slug) values ($1, 'ontario/town-of-port-hope')`, [ids.b]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.b, () => rows(`delete from buyer_follows where user_id = $1`, [ids.a]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.a, () => rows(`update buyer_follows set buyer_slug = 'ontario/hacked' where user_id = $1`, [ids.a]))).rejects.toThrow(/permission denied/);
    expect(await rows(`select count(*)::int as n from buyer_follows where user_id = $1`, [ids.a])).toEqual([{ n: 3 }]);
  });
});

describe("buyer_follow_counts: numbers only", () => {
  it("anyone reads counts per page, never who", async () => {
    const counts = (await asAnon(db, () => rows(`select * from buyer_follow_counts where buyer_slug = 'ontario/town-of-cobourg'`))) as Record<string, unknown>[];
    expect(counts).toEqual([{ buyer_slug: "ontario/town-of-cobourg", followers: 2 }]);
    expect(Object.keys(counts[0])).toEqual(["buyer_slug", "followers"]);
  });
});
