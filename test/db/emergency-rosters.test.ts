import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

const MIGRATION = "20261101000400_emergency_rosters.sql";
const sql = (file: string) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8");

async function freshDb(runs = 1): Promise<PGlite> {
  const d = await createTestDb();
  for (let i = 0; i < runs; i++) await d.exec(sql(MIGRATION));
  // The harness grants every table after its own migrations; repeat for ours.
  await d.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;`);
  return d;
}

/**
 * Migration 20261101000400 (After-Hours Vendor Roster) against real
 * Postgres (PGlite): each PM company sees and edits only its own buildings,
 * rows, share links and invites; anon sees nothing; a row can't be filed
 * under another company's building; members can only turn a share link
 * off. (Column-level grants aren't testable here: the harness grants every
 * table wholesale at the end; test/db/api-grants checks them.)
 */

let db: PGlite;
const ids = {
  pmA: randomUUID(),
  pmB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  rosterA: randomUUID(),
  rosterB: randomUUID(),
  entryA: randomUUID(),
  entryB: randomUUID(),
  linkA: randomUUID(),
  linkB: randomUUID(),
};
const TOKEN_A = "A".repeat(32);
const TOKEN_B = "b_-".repeat(10) + "zz";

beforeAll(async () => {
  db = await freshDb();
  const mkUser = (id: string, name: string) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: "property_manager" })]);
  await mkUser(ids.pmA, "pm-a");
  await mkUser(ids.pmB, "pm-b");
  await db.query(
    `insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'PM A','pm-a','property_manager','approved'), ($2,'PM B','pm-b','property_manager','approved')`,
    [ids.orgA, ids.orgB],
  );
  await db.query(`insert into organization_members (organization_id, user_id) values ($1,$2), ($3,$4)`, [ids.orgA, ids.pmA, ids.orgB, ids.pmB]);
  await db.query(
    `insert into emergency_rosters (id, organization_id, created_by, building_name, city, province) values ($1,$2,$3,'Maple Court','Hamilton','Ontario'), ($4,$5,$6,'Oak Tower','Austin','Texas')`,
    [ids.rosterA, ids.orgA, ids.pmA, ids.rosterB, ids.orgB, ids.pmB],
  );
  await db.query(
    `insert into emergency_roster_entries (id, roster_id, organization_id, category, primary_name, primary_phone) values ($1,$2,$3,'plumbing','Acme','416-555-0100'), ($4,$5,$6,'plumbing','Lone Star','512-555-0100')`,
    [ids.entryA, ids.rosterA, ids.orgA, ids.entryB, ids.rosterB, ids.orgB],
  );
  await db.query(`insert into emergency_roster_links (id, roster_id, organization_id, token) values ($1,$2,$3,$4), ($5,$6,$7,$8)`, [ids.linkA, ids.rosterA, ids.orgA, TOKEN_A, ids.linkB, ids.rosterB, ids.orgB, TOKEN_B]);
  await db.query(`insert into emergency_roster_invites (organization_id, entry_id, email_key) values ($1,$2,'ops@acme.ca'), ($3,$4,'hi@lonestar.com')`, [ids.orgA, ids.entryA, ids.orgB, ids.entryB]);
});
afterAll(async () => {
  await db?.close();
});

describe("emergency roster RLS", () => {
  it("a PM reads only their own company's buildings, rows, links and invites", async () => {
    const pick = async (table: string) => (await asUser(db, ids.pmA, () => db.query<{ organization_id: string }>(`select organization_id from ${table}`))).rows.map((r) => r.organization_id);
    for (const table of ["emergency_rosters", "emergency_roster_entries", "emergency_roster_links", "emergency_roster_invites"]) {
      expect(await pick(table)).toEqual([ids.orgA]);
    }
  });

  it("anon sees nothing", async () => {
    for (const table of ["emergency_rosters", "emergency_roster_entries", "emergency_roster_links", "emergency_roster_invites"]) {
      await expect(asAnon(db, () => db.query(`select id from ${table}`))).rejects.toThrow();
    }
  });

  it("a PM adds buildings to their own company only, and as themselves", async () => {
    await asUser(db, ids.pmA, () => db.query(`insert into emergency_rosters (organization_id, created_by, building_name) values ($1,$2,'Birch Place')`, [ids.orgA, ids.pmA]));
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into emergency_rosters (organization_id, created_by, building_name) values ($1,$2,'Sneaky')`, [ids.orgB, ids.pmA])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into emergency_rosters (organization_id, created_by, building_name) values ($1,$2,'Spoof')`, [ids.orgA, ids.pmB])),
    ).rejects.toThrow();
  });

  it("a PM can't edit or delete another company's building or rows", async () => {
    const upd = await asUser(db, ids.pmA, () => db.query(`update emergency_rosters set building_name = 'Hijacked' where id = $1 returning id`, [ids.rosterB]));
    expect(upd.rows).toEqual([]);
    const updE = await asUser(db, ids.pmA, () => db.query(`update emergency_roster_entries set primary_phone = '911' where id = $1 returning id`, [ids.entryB]));
    expect(updE.rows).toEqual([]);
    const del = await asUser(db, ids.pmA, () => db.query(`delete from emergency_rosters where id = $1 returning id`, [ids.rosterB]));
    expect(del.rows).toEqual([]);
    const { rows } = await db.query<{ building_name: string }>(`select building_name from emergency_rosters where id = $1`, [ids.rosterB]);
    expect(rows[0].building_name).toBe("Oak Tower");
    const own = await asUser(db, ids.pmA, () => db.query(`update emergency_roster_entries set available_24_7 = true where id = $1 returning id`, [ids.entryA]));
    expect(own.rows).toHaveLength(1);
  });

  it("a row can't be filed under another company's building", async () => {
    // Claiming its own company on B's building: the composite key refuses it.
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into emergency_roster_entries (roster_id, organization_id, category) values ($1,$2,'electrical')`, [ids.rosterB, ids.orgA])),
    ).rejects.toThrow();
    // Claiming B's company: RLS refuses it.
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into emergency_roster_entries (roster_id, organization_id, category) values ($1,$2,'electrical')`, [ids.rosterB, ids.orgB])),
    ).rejects.toThrow();
  });

  it("members can turn a share link off, never back on, and never another company's", async () => {
    const off = await asUser(db, ids.pmA, () => db.query(`update emergency_roster_links set revoked_at = now() where id = $1 returning id`, [ids.linkA]));
    expect(off.rows).toHaveLength(1);
    // A turned-off link is out of reach (0 rows), and stays off.
    const back = await asUser(db, ids.pmA, () => db.query(`update emergency_roster_links set revoked_at = null where id = $1 returning id`, [ids.linkA]));
    expect(back.rows).toEqual([]);
    const still = await db.query<{ revoked_at: string | null }>(`select revoked_at from emergency_roster_links where id = $1`, [ids.linkA]);
    expect(still.rows[0].revoked_at).not.toBeNull();
    // A live link can only be updated into the turned-off state.
    const live = randomUUID();
    await db.query(`insert into emergency_roster_links (id, roster_id, organization_id, token) values ($1,$2,$3,$4)`, [live, ids.rosterA, ids.orgA, "L".repeat(32)]);
    await expect(asUser(db, ids.pmA, () => db.query(`update emergency_roster_links set label = 'x' where id = $1`, [live]))).rejects.toThrow();
    const theirs = await asUser(db, ids.pmA, () => db.query(`update emergency_roster_links set revoked_at = now() where id = $1 returning id`, [ids.linkB]));
    expect(theirs.rows).toEqual([]);
    const { rows } = await db.query<{ revoked_at: string | null }>(`select revoked_at from emergency_roster_links where id = $1`, [ids.linkB]);
    expect(rows[0].revoked_at).toBeNull();
  });

  it("deleting a building takes its rows and links with it", async () => {
    const tmp = randomUUID();
    await db.query(`insert into emergency_rosters (id, organization_id, building_name) values ($1,$2,'Temp')`, [tmp, ids.orgA]);
    await db.query(`insert into emergency_roster_entries (roster_id, organization_id, category) values ($1,$2,'hvac')`, [tmp, ids.orgA]);
    await db.query(`insert into emergency_roster_links (roster_id, organization_id, token) values ($1,$2,$3)`, [tmp, ids.orgA, "T".repeat(32)]);
    await asUser(db, ids.pmA, () => db.query(`delete from emergency_rosters where id = $1`, [tmp]));
    const left = await db.query<{ n: number }>(`select (select count(*) from emergency_roster_entries where roster_id = $1)::int + (select count(*) from emergency_roster_links where roster_id = $1)::int as n`, [tmp]);
    expect(left.rows[0].n).toBe(0);
  });
});

describe("emergency roster checks", () => {
  it("rejects an unknown category, a custom row without a label, a second plumbing row and a bad token", async () => {
    await expect(db.query(`insert into emergency_roster_entries (roster_id, organization_id, category) values ($1,$2,'carpentry')`, [ids.rosterA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into emergency_roster_entries (roster_id, organization_id, category) values ($1,$2,'custom')`, [ids.rosterA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into emergency_roster_entries (roster_id, organization_id, category) values ($1,$2,'plumbing')`, [ids.rosterA, ids.orgA])).rejects.toThrow();
    await db.query(`insert into emergency_roster_entries (roster_id, organization_id, category, custom_label) values ($1,$2,'custom','Generator'), ($1,$2,'custom','Sewer backup')`, [ids.rosterA, ids.orgA]);
    await expect(db.query(`insert into emergency_roster_links (roster_id, organization_id, token) values ($1,$2,'short')`, [ids.rosterA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into emergency_rosters (organization_id, building_name) values ($1,'')`, [ids.orgA])).rejects.toThrow();
  });

  it("one invite per company per address, stored lower-case", async () => {
    await expect(db.query(`insert into emergency_roster_invites (organization_id, email_key) values ($1,'ops@acme.ca')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into emergency_roster_invites (organization_id, email_key) values ($1,'Ops@Other.ca')`, [ids.orgA])).rejects.toThrow();
    await db.query(`insert into emergency_roster_invites (organization_id, email_key) values ($1,'ops@acme.ca')`, [ids.orgB]);
  });

  it("is safe to run twice", async () => {
    const again = await freshDb(2);
    const { rows } = await again.query<{ n: number }>(`select count(*)::int as n from pg_policies where tablename like 'emergency_roster%'`);
    expect(rows[0].n).toBeGreaterThan(0);
    await again.close();
  });
});
