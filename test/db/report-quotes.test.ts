import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

const MIGRATION = "20261101000500_report_quotes.sql";
const sql = () => readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8");

/**
 * Loaded AFTER the harness's wholesale grants, so the migration's own
 * revokes and column-level grants are what the signed-in role really has
 * (the server-managed columns and the send log stay out of reach).
 */
async function freshDb(runs = 1): Promise<PGlite> {
  const d = await createTestDb();
  for (let i = 0; i < runs; i++) await d.exec(sql());
  return d;
}

/**
 * Migration 20261101000500 (Report → Quotes) against real Postgres (PGlite):
 * each organization reads and edits only its own reports, items and send
 * log; anon gets nothing; an item can't be attached to another company's
 * report; the stored file, extraction result, delete date and send log are
 * the server's alone; the table checks hold; re-running is safe.
 */

let db: PGlite;
const ids = {
  userA: randomUUID(),
  userB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  reportA: randomUUID(),
  reportB: randomUUID(),
  itemA: randomUUID(),
  itemB: randomUUID(),
  sendB: randomUUID(),
};

beforeAll(async () => {
  db = await freshDb();
  const mkUser = (id: string, name: string, role: string) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: role })]);
  await mkUser(ids.userA, "realtor-a", "property_manager");
  await mkUser(ids.userB, "pm-b", "property_manager");
  await db.query(
    `insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Brokerage A','brokerage-a','property_manager','approved'), ($2,'PM B','pm-b','property_manager','approved')`,
    [ids.orgA, ids.orgB],
  );
  await db.query(`insert into organization_members (organization_id, user_id) values ($1,$2), ($3,$4)`, [ids.orgA, ids.userA, ids.orgB, ids.userB]);
  await db.query(
    `insert into quote_reports (id, organization_id, created_by, title, city, region, street_address, file_path) values
      ($1,$2,$3,'12 Elm inspection','Toronto','Ontario','12 Elm St','${ids.orgA}/${ids.reportA}/x.pdf'),
      ($4,$5,$6,'Tower B condition assessment','Ottawa','Ontario','99 Bank St',null)`,
    [ids.reportA, ids.orgA, ids.userA, ids.reportB, ids.orgB, ids.userB],
  );
  await db.query(
    `insert into quote_report_items (id, report_id, organization_id, trade_slug, item, urgency, source_page, origin) values
      ($1,$2,$3,'electrical','Double-tapped breaker','safety',12,'ai'),
      ($4,$5,$6,'roofing','Worn shingles','monitor',4,'ai')`,
    [ids.itemA, ids.reportA, ids.orgA, ids.itemB, ids.reportB, ids.orgB],
  );
  await db.query(
    `insert into quote_report_sends (id, report_id, organization_id, initiated_by, trade_slug, recipient_organization_ids, item_count) values ($1,$2,$3,$4,'roofing',array[$5]::uuid[],1)`,
    [ids.sendB, ids.reportB, ids.orgB, ids.userB, ids.orgA],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("quote_reports RLS", () => {
  it("a member reads only their own organization's reports, items and send log", async () => {
    const reports = await asUser(db, ids.userA, () => db.query<{ id: string }>(`select id from quote_reports`));
    expect(reports.rows.map((r) => r.id)).toEqual([ids.reportA]);
    const items = await asUser(db, ids.userA, () => db.query<{ id: string }>(`select id from quote_report_items`));
    expect(items.rows.map((r) => r.id)).toEqual([ids.itemA]);
    const sends = await asUser(db, ids.userA, () => db.query<{ id: string }>(`select id from quote_report_sends`));
    expect(sends.rows).toEqual([]);
    const ownSends = await asUser(db, ids.userB, () => db.query<{ id: string }>(`select id from quote_report_sends`));
    expect(ownSends.rows.map((r) => r.id)).toEqual([ids.sendB]);
  });

  it("another organization's report is invisible even by id (no street address leaks)", async () => {
    const res = await asUser(db, ids.userA, () => db.query(`select street_address from quote_reports where id = $1`, [ids.reportB]));
    expect(res.rows).toEqual([]);
  });

  it("anon can't read anything", async () => {
    await expect(asAnon(db, () => db.query(`select id from quote_reports`))).rejects.toThrow();
    await expect(asAnon(db, () => db.query(`select id from quote_report_items`))).rejects.toThrow();
    await expect(asAnon(db, () => db.query(`select id from quote_report_sends`))).rejects.toThrow();
  });

  it("a member creates reports for their own organization only, as themselves", async () => {
    await asUser(db, ids.userA, () =>
      db.query(`insert into quote_reports (organization_id, created_by, title, source) values ($1,$2,'Typed list','manual')`, [ids.orgA, ids.userA]),
    );
    await expect(
      asUser(db, ids.userA, () => db.query(`insert into quote_reports (organization_id, created_by, title) values ($1,$2,'Sneaky')`, [ids.orgB, ids.userA])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.userA, () => db.query(`insert into quote_reports (organization_id, created_by, title) values ($1,$2,'Spoof')`, [ids.orgA, ids.userB])),
    ).rejects.toThrow();
  });

  it("an item can't be attached to another organization's report", async () => {
    // Own org id, other org's report.
    await expect(
      asUser(db, ids.userA, () =>
        db.query(`insert into quote_report_items (report_id, organization_id, item) values ($1,$2,'Injected')`, [ids.reportB, ids.orgA]),
      ),
    ).rejects.toThrow();
    // Other org's id and report.
    await expect(
      asUser(db, ids.userA, () =>
        db.query(`insert into quote_report_items (report_id, organization_id, item) values ($1,$2,'Injected')`, [ids.reportB, ids.orgB]),
      ),
    ).rejects.toThrow();
    const ok = await asUser(db, ids.userA, () =>
      db.query(`insert into quote_report_items (report_id, organization_id, item, trade_slug) values ($1,$2,'Loose handrail','carpentry') returning id`, [ids.reportA, ids.orgA]),
    );
    expect(ok.rows).toHaveLength(1);
  });

  it("a member can't edit or delete another organization's rows", async () => {
    const upd = await asUser(db, ids.userA, () => db.query(`update quote_reports set title = 'Hijacked' where id = $1 returning id`, [ids.reportB]));
    expect(upd.rows).toEqual([]);
    const updItem = await asUser(db, ids.userA, () => db.query(`update quote_report_items set item = 'Hijacked' where id = $1 returning id`, [ids.itemB]));
    expect(updItem.rows).toEqual([]);
    const del = await asUser(db, ids.userA, () => db.query(`delete from quote_reports where id = $1 returning id`, [ids.reportB]));
    expect(del.rows).toEqual([]);
    const delItem = await asUser(db, ids.userA, () => db.query(`delete from quote_report_items where id = $1 returning id`, [ids.itemB]));
    expect(delItem.rows).toEqual([]);
    const { rows } = await db.query<{ title: string }>(`select title from quote_reports where id = $1`, [ids.reportB]);
    expect(rows[0].title).toBe("Tower B condition assessment");
    const own = await asUser(db, ids.userA, () => db.query(`update quote_reports set reviewed_at = now(), city = 'Mississauga' where id = $1 returning id`, [ids.reportA]));
    expect(own.rows).toHaveLength(1);
  });

  it("server-managed columns and the send log are out of a member's reach", async () => {
    await expect(asUser(db, ids.userA, () => db.query(`update quote_reports set file_path = 'other/file.pdf' where id = $1`, [ids.reportA]))).rejects.toThrow();
    await expect(
      asUser(db, ids.userA, () => db.query(`update quote_reports set report_deleted_after = now() + interval '10 years' where id = $1`, [ids.reportA])),
    ).rejects.toThrow();
    await expect(asUser(db, ids.userA, () => db.query(`update quote_reports set extraction_status = 'done' where id = $1`, [ids.reportA]))).rejects.toThrow();
    await expect(
      asUser(db, ids.userA, () =>
        db.query(`insert into quote_report_sends (report_id, organization_id, initiated_by, trade_slug) values ($1,$2,$3,'electrical')`, [ids.reportA, ids.orgA, ids.userA]),
      ),
    ).rejects.toThrow();
    await expect(asUser(db, ids.userB, () => db.query(`update quote_report_sends set open_count = 99 where id = $1`, [ids.sendB]))).rejects.toThrow();
  });

  it("deleting a report removes its items and send log", async () => {
    const tmp = randomUUID();
    await db.query(`insert into quote_reports (id, organization_id, created_by, title) values ($1,$2,$3,'Temp')`, [tmp, ids.orgA, ids.userA]);
    await db.query(`insert into quote_report_items (report_id, organization_id, item) values ($1,$2,'Temp item')`, [tmp, ids.orgA]);
    await db.query(`insert into quote_report_sends (report_id, organization_id, initiated_by, trade_slug) values ($1,$2,$3,'plumbing')`, [tmp, ids.orgA, ids.userA]);
    const del = await asUser(db, ids.userA, () => db.query(`delete from quote_reports where id = $1 returning id`, [tmp]));
    expect(del.rows).toHaveLength(1);
    const left = await db.query(`select 1 from quote_report_items where report_id = $1 union all select 1 from quote_report_sends where report_id = $1`, [tmp]);
    expect(left.rows).toEqual([]);
  });
});

describe("quote_reports checks", () => {
  it("defaults the 90-day delete date and records who started a send", async () => {
    const { rows } = await db.query<{ days: number }>(`select round(extract(epoch from (report_deleted_after - created_at)) / 86400) as days from quote_reports where id = $1`, [ids.reportA]);
    expect(Number(rows[0].days)).toBe(90);
    await expect(db.query(`insert into quote_report_sends (report_id, organization_id, trade_slug) values ($1,$2,'roofing')`, [ids.reportA, ids.orgA])).rejects.toThrow();
  });

  it("rejects bad urgency, empty items, out-of-range pages, unknown report types and malformed token hashes", async () => {
    await expect(db.query(`insert into quote_report_items (report_id, organization_id, item, urgency) values ($1,$2,'X','urgent')`, [ids.reportA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into quote_report_items (report_id, organization_id, item) values ($1,$2,'')`, [ids.reportA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into quote_report_items (report_id, organization_id, item, source_page) values ($1,$2,'X',0)`, [ids.reportA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into quote_report_items (report_id, organization_id, item, trade_slug) values ($1,$2,'X','Not A Slug')`, [ids.reportA, ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into quote_reports (organization_id, title, report_type) values ($1,'X','appraisal')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into quote_reports (organization_id, title, country) values ($1,'X','MX')`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`insert into quote_reports (organization_id, title, file_size) values ($1,'X',15728641)`, [ids.orgA])).rejects.toThrow();
    await expect(db.query(`update quote_report_sends set share_token_hash = 'not-a-hash' where id = $1`, [ids.sendB])).rejects.toThrow();
  });

  it("is safe to run twice", async () => {
    const again = await freshDb(2);
    const { rows } = await again.query<{ n: number }>(`select count(*)::int as n from pg_policies where tablename in ('quote_reports','quote_report_items','quote_report_sends')`);
    expect(rows[0].n).toBe(9);
    await again.close();
  });
});
