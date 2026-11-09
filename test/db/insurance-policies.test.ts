import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

const MIGRATION = "20261105000100_insurance_policy_numbers.sql";
const sql = readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8");

/**
 * Migration 20261105000100 against real Postgres (PGlite): a company reads and
 * edits only its own policy number, and anon sees nothing. The migration runs
 * twice to prove it can replay.
 */

let db: PGlite;
const ids = { a: randomUUID(), b: randomUUID(), orgA: randomUUID(), orgB: randomUUID() };

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(sql);
  await db.exec(sql);
  await db.exec(`
    insert into auth.users (id, email) values ('${ids.a}', 'a@example.com'), ('${ids.b}', 'b@example.com');
    insert into public.organizations (id, name, slug, organization_type) values
      ('${ids.orgA}', 'A', 'a', 'trade_company'), ('${ids.orgB}', 'B', 'b', 'trade_company');
    insert into public.organization_members (organization_id, user_id) values
      ('${ids.orgA}', '${ids.a}'), ('${ids.orgB}', '${ids.b}');
    insert into public.organization_insurance_policies (organization_id, policy_number) values ('${ids.orgB}', 'B-SECRET');
  `);
  // The harness grants every table after its own migrations; repeat ours so this file tests the policies.
  await db.exec(`
    revoke all on public.organization_insurance_policies from anon, authenticated;
    grant select, delete on public.organization_insurance_policies to authenticated;
    grant insert (organization_id, policy_number) on public.organization_insurance_policies to authenticated;
    grant update (policy_number) on public.organization_insurance_policies to authenticated;
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("organization_insurance_policies", () => {
  it("lets a company add, read and change its own number", async () => {
    await asUser(db, ids.a, async () => {
      await db.exec(`insert into public.organization_insurance_policies (organization_id, policy_number) values ('${ids.orgA}', 'A-1')`);
      await db.exec(`update public.organization_insurance_policies set policy_number = 'A-2' where organization_id = '${ids.orgA}'`);
      const { rows } = await db.query<{ policy_number: string }>(`select policy_number from public.organization_insurance_policies`);
      expect(rows.map((r) => r.policy_number)).toEqual(["A-2"]);
    });
  });

  it("hides other companies' numbers and blocks writing them", async () => {
    await asUser(db, ids.a, async () => {
      const { rows } = await db.query(`select 1 from public.organization_insurance_policies where organization_id = '${ids.orgB}'`);
      expect(rows).toHaveLength(0);
      const up = await db.query(`update public.organization_insurance_policies set policy_number = 'X' where organization_id = '${ids.orgB}'`);
      expect(up.affectedRows ?? 0).toBe(0);
      await expect(
        db.exec(`insert into public.organization_insurance_policies (organization_id, policy_number) values ('${ids.orgB}', 'X')`),
      ).rejects.toThrow();
    });
  });

  it("gives anon no access at all", async () => {
    await asAnon(db, async () => {
      await expect(db.query(`select * from public.organization_insurance_policies`)).rejects.toThrow(/permission denied/i);
    });
  });
});
