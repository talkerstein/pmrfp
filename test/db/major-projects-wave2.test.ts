import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, createTestDb } from "./harness";

/**
 * Wave-2 migration (20261012000003): status 'application', the publisher's
 * own last-updated date and the cross-source link group, both exposed on
 * the public view (still without the Trade Pro fields). Safe to re-run.
 */

const MIGRATIONS = ["20261012000001_major_projects.sql", "20261012000003_major_projects_wave2.sql"];
let db: PGlite;

beforeAll(async () => {
  db = await createTestDb(MIGRATIONS);
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATIONS[1]), "utf8"));
  await db.query(
    `insert into major_projects (slug, source, source_key, name, license, status, general_contractor) values
       ('app-row', 'apps-toronto', 'apps-toronto:a', 'Rezoning application', 'OGL-Toronto', 'application', null),
       ('bc-row', 'bc-major-projects', 'bc-major-projects:1', 'BC project', 'OGL-BC', 'approved', 'PCL')`,
  );
  await db.query(`update major_projects set source_updated = '2024-12-01' where slug = 'bc-row'`);
  await db.query(`update major_projects set link_group = (select id from major_projects where slug = 'bc-row')`);
});

describe("major_projects wave 2 migration", () => {
  it("accepts the 'application' status and still rejects unknown ones", async () => {
    const r = await db.query<{ status: string }>(`select status from major_projects where slug = 'app-row'`);
    expect(r.rows[0].status).toBe("application");
    await expect(db.query(`insert into major_projects (slug, source, source_key, name, license, status) values ('bad', 'x-y', 'x-y:1', 'Bad', 'OGL', 'rumoured')`)).rejects.toThrow();
  });

  it("the public view carries source_updated and link_group, never the GC", async () => {
    const rows = await asAnon(db, async () => (await db.query<Record<string, unknown>>(`select * from major_projects_public order by slug`)).rows);
    expect(rows.map((r) => r.slug)).toEqual(["app-row", "bc-row"]);
    const d = rows[1].source_updated;
    expect(d instanceof Date ? d.toISOString().slice(0, 10) : String(d)).toBe("2024-12-01");
    expect(rows[0].link_group).toBe(rows[1].id);
    expect(rows[1]).not.toHaveProperty("general_contractor");
    expect(rows[1].has_gc).toBe(true);
  });
});
