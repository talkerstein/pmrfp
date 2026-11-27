import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

const BASE = "20261101000500_report_quotes.sql";
const MIGRATION = "20261101000600_report_quotes_followups.sql";
const read = (f: string) => readFileSync(join(process.cwd(), "supabase", "migrations", f), "utf8");

/** Loaded after the harness's wholesale grants, so the migrations' own revokes and column grants apply. */
async function freshDb(runs = 1): Promise<PGlite> {
  const d = await createTestDb();
  await d.exec(read(BASE));
  for (let i = 0; i < runs; i++) await d.exec(read(MIGRATION));
  return d;
}

/**
 * Migration 20261101000600 (Report → Quotes follow-ups) against real
 * Postgres (PGlite): a trade group can only be linked to the organization's
 * own report and own RFP; the summary's share-link hash and every inbox and
 * forwarded-email row are the server's to write; members read only their
 * own organization's settings, and each user only their own forwarding
 * address and log; anon gets nothing; the checks hold; re-running is safe.
 */

let db: PGlite;
const ids = {
  userA: randomUUID(),
  userA2: randomUUID(),
  userB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  reportA: randomUUID(),
  reportB: randomUUID(),
  rfpA: randomUUID(),
  rfpA2: randomUUID(),
  rfpB: randomUUID(),
  linkB: randomUUID(),
};
const HASH = "a".repeat(64);

beforeAll(async () => {
  db = await freshDb();
  const mkUser = (id: string, name: string) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: "property_manager" })]);
  await mkUser(ids.userA, "agent-a");
  await mkUser(ids.userA2, "agent-a2");
  await mkUser(ids.userB, "pm-b");
  await db.query(
    `insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Brokerage A','brokerage-a','property_manager','approved'), ($2,'PM B','pm-b','property_manager','approved')`,
    [ids.orgA, ids.orgB],
  );
  await db.query(`insert into organization_members (organization_id, user_id) values ($1,$2), ($1,$3), ($4,$5)`, [ids.orgA, ids.userA, ids.userA2, ids.orgB, ids.userB]);
  await db.query(
    `insert into quote_reports (id, organization_id, created_by, title, city, region, street_address) values
      ($1,$2,$3,'12 Elm inspection','Toronto','Ontario','12 Elm St'),
      ($4,$5,$6,'Tower B condition assessment','Ottawa','Ontario','99 Bank St')`,
    [ids.reportA, ids.orgA, ids.userA, ids.reportB, ids.orgB, ids.userB],
  );
  await db.query(
    `insert into rfp_posts (id, title, slug, status, source_type, posted_by_user_id, posted_by_organization_id, published_at) values
      ($1,'Electrical repairs','electrical-repairs-a','published','property_manager_direct',$2,$3,now()),
      ($4,'Plumbing repairs','plumbing-repairs-a','pending_review','property_manager_direct',$2,$3,null),
      ($5,'Roof repairs','roof-repairs-b','published','property_manager_direct',$6,$7,now())`,
    [ids.rfpA, ids.userA, ids.orgA, ids.rfpA2, ids.rfpB, ids.userB, ids.orgB],
  );
  // Server-written rows (service role bypasses RLS; the harness runs these as the owner).
  await db.query(`insert into quote_report_rfps (id, report_id, organization_id, trade_slug, rfp_id, created_by) values ($1,$2,$3,'roofing',$4,$5)`, [
    ids.linkB,
    ids.reportB,
    ids.orgB,
    ids.rfpB,
    ids.userB,
  ]);
  await db.query(
    `insert into quote_report_summaries (report_id, organization_id, prepared_by, include_address, share_token_hash, share_created_at) values
      ($1,$2,$3,false,$4,now()), ($5,$6,$7,true,null,null)`,
    [ids.reportA, ids.orgA, ids.userA, HASH, ids.reportB, ids.orgB, ids.userB],
  );
  await db.query(
    `insert into quote_report_inboxes (organization_id, user_id, token) values ($1,$2,'aaaaaaaaaaaaaaaaaaaa'), ($1,$3,'bbbbbbbbbbbbbbbbbbbb'), ($4,$5,'cccccccccccccccccccc')`,
    [ids.orgA, ids.userA, ids.userA2, ids.orgB, ids.userB],
  );
  await db.query(
    `insert into quote_report_inbound (organization_id, user_id, provider_message_id, from_address, outcome) values
      ($1,$2,'m-a','inspector@example.com','no_pdf'), ($1,$3,'m-a2','x@example.com','created'), ($4,$5,'m-b','y@example.com','cap')`,
    [ids.orgA, ids.userA, ids.userA2, ids.orgB, ids.userB],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("quote_report_rfps: trade group → RFP links", () => {
  it("a member links their own report's trade group to their own RFP", async () => {
    const res = await asUser(db, ids.userA, () =>
      db.query(`insert into quote_report_rfps (report_id, organization_id, trade_slug, rfp_id, created_by) values ($1,$2,'electrical',$3,$4) returning id`, [
        ids.reportA,
        ids.orgA,
        ids.rfpA,
        ids.userA,
      ]),
    );
    expect(res.rows).toHaveLength(1);
    // A pending RFP of their own can be linked too (the summary shows it as not yet requested).
    const pending = await asUser(db, ids.userA, () =>
      db.query(`insert into quote_report_rfps (report_id, organization_id, trade_slug, rfp_id, created_by) values ($1,$2,'plumbing',$3,$4) returning id`, [
        ids.reportA,
        ids.orgA,
        ids.rfpA2,
        ids.userA,
      ]),
    );
    expect(pending.rows).toHaveLength(1);
  });

  it("rejects another company's report, another company's RFP, another org id, or a spoofed author", async () => {
    const attempt = (reportId: string, orgId: string, rfpId: string, by: string) =>
      asUser(db, ids.userA, () =>
        db.query(`insert into quote_report_rfps (report_id, organization_id, trade_slug, rfp_id, created_by) values ($1,$2,'hvac',$3,$4)`, [reportId, orgId, rfpId, by]),
      );
    await expect(attempt(ids.reportB, ids.orgA, ids.rfpA, ids.userA)).rejects.toThrow();
    await expect(attempt(ids.reportA, ids.orgA, ids.rfpB, ids.userA)).rejects.toThrow();
    await expect(attempt(ids.reportB, ids.orgB, ids.rfpB, ids.userA)).rejects.toThrow();
    await expect(attempt(ids.reportA, ids.orgA, ids.rfpA, ids.userB)).rejects.toThrow();
  });

  it("a member reads and removes only their own organization's links, and can't edit them", async () => {
    const mine = await asUser(db, ids.userA, () => db.query<{ rfp_id: string }>(`select rfp_id from quote_report_rfps order by trade_slug`));
    expect(mine.rows.map((r) => r.rfp_id)).toEqual([ids.rfpA, ids.rfpA2]);
    const del = await asUser(db, ids.userA, () => db.query(`delete from quote_report_rfps where id = $1 returning id`, [ids.linkB]));
    expect(del.rows).toEqual([]);
    await expect(asUser(db, ids.userA, () => db.query(`update quote_report_rfps set rfp_id = $1`, [ids.rfpB]))).rejects.toThrow();
    const own = await asUser(db, ids.userA, () => db.query(`delete from quote_report_rfps where rfp_id = $1 returning id`, [ids.rfpA2]));
    expect(own.rows).toHaveLength(1);
    const { rows } = await db.query(`select id from quote_report_rfps where id = $1`, [ids.linkB]);
    expect(rows).toHaveLength(1);
  });

  it("checks the trade slug and ignores a duplicate link", async () => {
    await expect(
      db.query(`insert into quote_report_rfps (report_id, organization_id, trade_slug, rfp_id) values ($1,$2,'Not A Slug',$3)`, [ids.reportA, ids.orgA, ids.rfpA]),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into quote_report_rfps (report_id, organization_id, trade_slug, rfp_id) values ($1,$2,'electrical',$3)`, [ids.reportA, ids.orgA, ids.rfpA]),
    ).rejects.toThrow();
  });
});

describe("quote_report_summaries: share settings", () => {
  it("a member reads their own organization's settings, never the link's hash", async () => {
    const res = await asUser(db, ids.userA2, () => db.query<{ report_id: string; include_address: boolean }>(`select report_id, include_address from quote_report_summaries`));
    expect(res.rows).toEqual([{ report_id: ids.reportA, include_address: false }]);
    await expect(asUser(db, ids.userA, () => db.query(`select share_token_hash from quote_report_summaries`))).rejects.toThrow();
    await expect(asUser(db, ids.userA, () => db.query(`select * from quote_report_summaries`))).rejects.toThrow();
  });

  it("only the server writes: no insert, update or delete for signed-in users", async () => {
    await expect(
      asUser(db, ids.userA, () => db.query(`insert into quote_report_summaries (report_id, organization_id) values ($1,$2)`, [ids.reportB, ids.orgA])),
    ).rejects.toThrow();
    await expect(asUser(db, ids.userA, () => db.query(`update quote_report_summaries set include_address = true`))).rejects.toThrow();
    await expect(asUser(db, ids.userA, () => db.query(`delete from quote_report_summaries`))).rejects.toThrow();
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from quote_report_summaries`);
    expect(rows[0].n).toBe(2);
  });

  it("the hash must be a sha256 hex digest and opens can't go negative", async () => {
    await expect(db.query(`update quote_report_summaries set share_token_hash = 'raw-token-here' where report_id = $1`, [ids.reportA])).rejects.toThrow();
    await expect(db.query(`update quote_report_summaries set share_token_hash = $1 where report_id = $2`, ["A".repeat(64), ids.reportA])).rejects.toThrow();
    await expect(db.query(`update quote_report_summaries set open_count = -1 where report_id = $1`, [ids.reportA])).rejects.toThrow();
    // One hash, one summary.
    await expect(db.query(`update quote_report_summaries set share_token_hash = $1 where report_id = $2`, [HASH, ids.reportB])).rejects.toThrow();
  });
});

describe("quote_report_inboxes and quote_report_inbound: forwarding", () => {
  it("each user reads only their own forwarding address, even inside their organization", async () => {
    const a = await asUser(db, ids.userA, () => db.query<{ token: string }>(`select token from quote_report_inboxes`));
    expect(a.rows.map((r) => r.token)).toEqual(["aaaaaaaaaaaaaaaaaaaa"]);
    const a2 = await asUser(db, ids.userA2, () => db.query<{ token: string }>(`select token from quote_report_inboxes`));
    expect(a2.rows.map((r) => r.token)).toEqual(["bbbbbbbbbbbbbbbbbbbb"]);
  });

  it("a former member loses their address and log", async () => {
    await db.query(`delete from organization_members where organization_id = $1 and user_id = $2`, [ids.orgA, ids.userA2]);
    const inbox = await asUser(db, ids.userA2, () => db.query(`select token from quote_report_inboxes`));
    expect(inbox.rows).toEqual([]);
    const log = await asUser(db, ids.userA2, () => db.query(`select id from quote_report_inbound`));
    expect(log.rows).toEqual([]);
    await db.query(`insert into organization_members (organization_id, user_id) values ($1,$2)`, [ids.orgA, ids.userA2]);
  });

  it("each user reads only their own forwarded-email log", async () => {
    const a = await asUser(db, ids.userA, () => db.query<{ provider_message_id: string; outcome: string }>(`select provider_message_id, outcome from quote_report_inbound`));
    expect(a.rows).toEqual([{ provider_message_id: "m-a", outcome: "no_pdf" }]);
  });

  it("signed-in users can't create, rotate or fake addresses or log rows", async () => {
    await expect(
      asUser(db, ids.userA, () => db.query(`insert into quote_report_inboxes (organization_id, user_id, token) values ($1,$2,'dddddddddddddddddddd')`, [ids.orgB, ids.userA])),
    ).rejects.toThrow();
    await expect(asUser(db, ids.userA, () => db.query(`update quote_report_inboxes set token = 'eeeeeeeeeeeeeeeeeeee'`))).rejects.toThrow();
    await expect(asUser(db, ids.userA, () => db.query(`delete from quote_report_inboxes`))).rejects.toThrow();
    await expect(
      asUser(db, ids.userA, () => db.query(`insert into quote_report_inbound (organization_id, user_id, provider_message_id) values ($1,$2,'fake')`, [ids.orgA, ids.userA])),
    ).rejects.toThrow();
    await expect(asUser(db, ids.userA, () => db.query(`update quote_report_inbound set outcome = 'created'`))).rejects.toThrow();
    await expect(asUser(db, ids.userA, () => db.query(`delete from quote_report_inbound`))).rejects.toThrow();
  });

  it("checks the token, the outcome, and one log row per provider message", async () => {
    await expect(db.query(`insert into quote_report_inboxes (organization_id, user_id, token) values ($1,$2,'Short')`, [ids.orgB, ids.userA])).rejects.toThrow();
    await expect(db.query(`insert into quote_report_inboxes (organization_id, user_id, token) values ($1,$2,'aaaaaaaaaaaaaaaaaaaa')`, [ids.orgB, ids.userA])).rejects.toThrow();
    // One address per user and organization.
    await expect(db.query(`insert into quote_report_inboxes (organization_id, user_id, token) values ($1,$2,'ffffffffffffffffffff')`, [ids.orgA, ids.userA])).rejects.toThrow();
    await expect(
      db.query(`insert into quote_report_inbound (organization_id, user_id, provider_message_id, outcome) values ($1,$2,'m-x','sent_reply')`, [ids.orgA, ids.userA]),
    ).rejects.toThrow();
    await expect(db.query(`insert into quote_report_inbound (organization_id, user_id, provider_message_id) values ($1,$2,'m-a')`, [ids.orgA, ids.userA])).rejects.toThrow();
    await expect(db.query(`insert into quote_report_inbound (organization_id, user_id, provider, provider_message_id) values ($1,$2,'other','m-y')`, [ids.orgA, ids.userA])).rejects.toThrow();
  });
});

describe("anon and cleanup", () => {
  it("anon can't read or write any of the new tables", async () => {
    for (const t of ["quote_report_rfps", "quote_report_summaries", "quote_report_inboxes", "quote_report_inbound"]) {
      await expect(asAnon(db, () => db.query(`select 1 from ${t}`))).rejects.toThrow();
    }
    await expect(
      asAnon(db, () => db.query(`insert into quote_report_inbound (organization_id, user_id, provider_message_id) values ($1,$2,'anon')`, [ids.orgA, ids.userA])),
    ).rejects.toThrow();
  });

  it("deleting a report removes its links and summary settings", async () => {
    await db.query(`delete from quote_reports where id = $1`, [ids.reportB]);
    const links = await db.query(`select id from quote_report_rfps where report_id = $1`, [ids.reportB]);
    const settings = await db.query(`select report_id from quote_report_summaries where report_id = $1`, [ids.reportB]);
    expect(links.rows).toEqual([]);
    expect(settings.rows).toEqual([]);
  });

  it("re-running the migration is safe and doesn't duplicate policies", async () => {
    const again = await freshDb(2);
    try {
      const { rows } = await again.query<{ n: number }>(
        `select count(*)::int as n from pg_policies where tablename in ('quote_report_rfps','quote_report_summaries','quote_report_inboxes','quote_report_inbound')`,
      );
      expect(rows[0].n).toBe(6);
    } finally {
      await again.close();
    }
  });
});
