import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

const MIGRATION = "20261101000100_vendor_certificates.sql";
// notification_preferences comes from this one; its trigram index spans two
// lines, which the harness's line filter can't strip, so drop the whole statement.
const NOTIFS = "20260604000001_region_liquidity_waitlist_notifs.sql";
const sql = (file: string) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8").replace(/create index[^;]*using gin[^;]*;/gi, "");

async function freshDb(runs = 1): Promise<PGlite> {
  const d = await createTestDb();
  await d.exec(sql(NOTIFS));
  for (let i = 0; i < runs; i++) await d.exec(sql(MIGRATION));
  // The harness grants every table after its own migrations; repeat for ours.
  await d.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;`);
  return d;
}

/**
 * Migration 20261101000100 (vendor insurance tracker) against real Postgres
 * (PGlite): each PM company sees and edits only its own vendor list, anon
 * sees nothing, and the table checks reject bad values. (Column-level grants
 * aren't testable here: the harness grants every table wholesale at the end.)
 */

let db: PGlite;
const ids = {
  pmA: randomUUID(),
  pmB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  certA: randomUUID(),
  certB: randomUUID(),
};

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
    `insert into vendor_certificates (id, organization_id, created_by, vendor_name, cert_type, expires_on) values ($1,$2,$3,'Acme HVAC','wsib_clearance','2027-03-31'), ($4,$5,$6,'Snow Pros','general_liability',null)`,
    [ids.certA, ids.orgA, ids.pmA, ids.certB, ids.orgB, ids.pmB],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("vendor_certificates RLS", () => {
  it("a PM reads only their own company's vendors", async () => {
    const res = await asUser(db, ids.pmA, () => db.query<{ id: string }>(`select id from vendor_certificates`));
    expect(res.rows.map((r) => r.id)).toEqual([ids.certA]);
  });

  it("anon sees nothing", async () => {
    await expect(asAnon(db, () => db.query(`select id from vendor_certificates`))).rejects.toThrow();
  });

  it("a PM can add to their own list, not another company's, and not as someone else", async () => {
    await asUser(db, ids.pmA, () =>
      db.query(`insert into vendor_certificates (organization_id, created_by, vendor_name) values ($1,$2,'Roof Co')`, [ids.orgA, ids.pmA]),
    );
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into vendor_certificates (organization_id, created_by, vendor_name) values ($1,$2,'Sneaky')`, [ids.orgB, ids.pmA])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.pmA, () => db.query(`insert into vendor_certificates (organization_id, created_by, vendor_name) values ($1,$2,'Spoof')`, [ids.orgA, ids.pmB])),
    ).rejects.toThrow();
  });

  it("a PM can't edit or delete another company's rows", async () => {
    const upd = await asUser(db, ids.pmA, () => db.query(`update vendor_certificates set vendor_name = 'Hijacked' where id = $1 returning id`, [ids.certB]));
    expect(upd.rows).toEqual([]);
    const del = await asUser(db, ids.pmA, () => db.query(`delete from vendor_certificates where id = $1 returning id`, [ids.certB]));
    expect(del.rows).toEqual([]);
    const { rows } = await db.query<{ vendor_name: string }>(`select vendor_name from vendor_certificates where id = $1`, [ids.certB]);
    expect(rows[0].vendor_name).toBe("Snow Pros");
    const own = await asUser(db, ids.pmA, () => db.query(`update vendor_certificates set insurer = 'Intact' where id = $1 returning id`, [ids.certA]));
    expect(own.rows).toHaveLength(1);
  });
});

describe("vendor_certificates checks", () => {
  it("rejects an unknown certificate type, an empty name and a malformed token hash", async () => {
    await expect(db.query(`insert into vendor_certificates (organization_id, vendor_name, cert_type) values ($1,'X','bonding')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into vendor_certificates (organization_id, vendor_name) values ($1,'')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`update vendor_certificates set request_token_hash = 'not-a-hash' where id = $1`, [ids.certA])).rejects.toThrow();
  });

  it("adds the digest opt-out to notification preferences, on by default", async () => {
    const { rows } = await db.query<{ column_default: string }>(
      `select column_default from information_schema.columns where table_name = 'notification_preferences' and column_name = 'cert_reminders'`,
    );
    expect(rows[0]?.column_default).toBe("true");
  });

  it("is safe to run twice", async () => {
    const again = await freshDb(2);
    await again.close();
  });
});
