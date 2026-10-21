import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Towns, Part B2 (20261021000060) against real Postgres (PGlite): the new
 * source type and town columns, free responses that never count, no
 * responses on a tender mirror, questions answered once and published
 * without the asker, addenda never edited, the 50-a-day invite cap, the
 * append-only log, the public views, and that it re-runs.
 */
const MIGRATION = "20261021000060_towns_part_b2.sql";
let db: PGlite;
const ids = {
  clerk: randomUUID(),
  trade: randomUUID(),
  other: randomUUID(),
  town: randomUUID(),
  tradeOrg: randomUUID(),
  rfq: randomUUID(),
  mirror: randomUUID(),
  pmJob: randomUUID(),
  pm: randomUUID(),
};
const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

beforeAll(async () => {
  db = await createTestDb([
    "20260924000002_gc_packages.sql",
    "20261007000001_landlord.sql",
    "20261019000001_dedupe_signups.sql",
    "20261021000020_pm_job_flow.sql",
    "20261021000040_public_buyer_towns.sql",
    MIGRATION,
  ]);
  // Again after the harness's blanket test grants, so the revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  const mkUser = (id: string, role: string, email: string) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ primary_role: role })]);
  await mkUser(ids.clerk, "public_buyer", "clerk@cobourg.ca");
  await mkUser(ids.trade, "trade", "roofer@example.com");
  await mkUser(ids.other, "trade", "nosy@example.com");
  await mkUser(ids.pm, "property_manager", "pm@example.com");
  await db.query(`insert into organizations (id, name, slug, organization_type, profile_status) values ($1, 'Town of Cobourg', 'town-of-cobourg-b2', 'public_buyer', 'approved'), ($2, 'Roofer', 'roofer-b2', 'trade_company', 'pending_review')`, [ids.town, ids.tradeOrg]);
  await db.query(`insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner'), ($3, $4, 'owner')`, [ids.town, ids.clerk, ids.tradeOrg, ids.trade]);
  await db.query(
    `insert into buyer_pages (buyer_key, province_code, buyer_name, organization_id, verified_method, verified_domain) values ('ontario/town-of-cobourg', 'ON', 'Town of Cobourg', $1, 'email_domain', 'cobourg.ca')`,
    [ids.town],
  );
  await db.query(
    `insert into rfp_posts (id, title, slug, summary, scope, status, source_type, posted_by_user_id, posted_by_organization_id, published_at, buyer_key, buyer_name, post_kind, deadline, contact_visibility, contact_email)
     values ($1, 'Grass cutting 2027', 'grass-cutting-2027', 'Three parks', 'Cut weekly', 'published', 'public_buyer_direct', $2, $3, now(), 'ontario/town-of-cobourg', 'Town of Cobourg', 'quote_request', '2099-05-01', 'pmrfp_mediated', 'clerk@cobourg.ca')`,
    [ids.rfq, ids.clerk, ids.town],
  );
  await db.query(
    `insert into rfp_posts (id, title, slug, status, source_type, posted_by_user_id, posted_by_organization_id, published_at, buyer_key, buyer_name, post_kind, official_url, official_portal)
     values ($1, 'Arena roof', 'arena-roof', 'published', 'public_buyer_direct', $2, $3, now(), 'ontario/town-of-cobourg', 'Town of Cobourg', 'tender_mirror', 'https://cobourg.bidsandtenders.ca/x', 'bids&tenders')`,
    [ids.mirror, ids.clerk, ids.town],
  );
  await db.query(
    `insert into rfp_posts (id, title, slug, status, source_type, posted_by_user_id, published_at) values ($1, 'PM job', 'pm-job-b2', 'published', 'property_manager_direct', $2, now())`,
    [ids.pmJob, ids.pm],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("rfp_posts", () => {
  it("accepts public_buyer_direct and keeps the other source types", async () => {
    await expect(db.query(`insert into rfp_posts (title, slug, source_type) values ('x', 'x-bad', 'city')`)).rejects.toThrow();
    for (const s of ["property_manager_direct", "gc_package", "public_source"]) {
      await db.query(`insert into rfp_posts (title, slug, source_type) values ('x', $1, $2)`, [`x-${s}`, s]);
    }
  });
  it("a public buyer's job names its page and kind; a mirror needs its official link", async () => {
    const insert = (extra: string, values: string) =>
      db.query(`insert into rfp_posts (title, slug, source_type${extra}) values ('t', '${randomUUID()}', 'public_buyer_direct'${values})`);
    await expect(insert("", "")).rejects.toThrow();
    await expect(insert(", buyer_key", ", 'ontario/town-of-cobourg'")).rejects.toThrow();
    await expect(insert(", buyer_key, post_kind", ", 'ontario/town-of-cobourg', 'tender_mirror'")).rejects.toThrow();
    await expect(insert(", buyer_key, post_kind, official_url", ", 'ontario/town-of-cobourg', 'tender_mirror', 'javascript:alert(1)'")).rejects.toThrow();
    await expect(insert(", buyer_key, post_kind", ", 'ontario/town-of-cobourg', 'sealed_box'")).rejects.toThrow();
    await insert(", buyer_key, post_kind", ", 'ontario/town-of-cobourg', 'quote_request'");
  });
});

describe("only a town posts as its page; dates move by addendum", () => {
  const post = (uid: string, org: string | null, key = "ontario/town-of-cobourg") =>
    asUser(db, uid, () =>
      db.query(
        `insert into rfp_posts (title, slug, status, source_type, posted_by_user_id, posted_by_organization_id, buyer_key, buyer_name, post_kind) values ('t', $1, 'pending_review', 'public_buyer_direct', $2, $3, $4, 'Town of Cobourg', 'quote_request')`,
        [randomUUID(), uid, org, key],
      ),
    );
  it("the town's own member posts as its page; anyone else (or another page) is refused", async () => {
    await post(ids.clerk, ids.town);
    await expect(post(ids.pm, null)).rejects.toThrow(/Only a public buyer posts as a town/);
    await expect(post(ids.trade, ids.tradeOrg)).rejects.toThrow(/Only a public buyer posts as a town/);
    await expect(post(ids.clerk, ids.town, "ontario/town-of-port-hope")).rejects.toThrow(/own town's page/);
  });
  it("the town can close its post, but not move its dates or change its town outside an addendum", async () => {
    await expect(asUser(db, ids.clerk, () => db.query(`update rfp_posts set deadline = '2099-06-01' where id = $1`, [ids.rfq]))).rejects.toThrow(/addendum/);
    await expect(asUser(db, ids.clerk, () => db.query(`update rfp_posts set buyer_key = 'ontario/town-of-port-hope' where id = $1`, [ids.rfq]))).rejects.toThrow(/keeps its town/);
    await asUser(db, ids.clerk, () => db.query(`update rfp_posts set summary = 'Three parks, weekly, May to October' where id = $1`, [ids.rfq]));
    // The server (service role) moves the date when an addendum says so.
    await db.query(`update rfp_posts set deadline = '2099-05-01' where id = $1`, [ids.rfq]);
  });
});

describe("responses", () => {
  it("a response to a town's quote request never uses the free allowance, even when the trade asks for it", async () => {
    await db.query(`insert into rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message, used_free_allowance) values ($1, $2, $3, 'hi', true)`, [ids.rfq, ids.tradeOrg, ids.trade]);
    expect(await rows(`select used_free_allowance from rfp_interests where rfp_id = $1`, [ids.rfq])).toEqual([{ used_free_allowance: false }]);
  });
  it("still refuses a 4th free PM-job response after three this month, and town responses don't count toward it", async () => {
    const jobs = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [i, id] of jobs.entries()) {
      await db.query(`insert into rfp_posts (id, title, slug, status, source_type, posted_by_user_id, published_at) values ($1, 'j', $2, 'published', 'property_manager_direct', $3, now())`, [id, `pm-free-${i}`, ids.pm]);
    }
    for (const id of jobs.slice(0, 3)) {
      await db.query(`insert into rfp_interests (rfp_id, trade_organization_id, message, used_free_allowance) values ($1, $2, 'hi', true)`, [id, ids.tradeOrg]);
    }
    await expect(db.query(`insert into rfp_interests (rfp_id, trade_organization_id, message, used_free_allowance) values ($1, $2, 'hi', true)`, [jobs[3], ids.tradeOrg])).rejects.toThrow(/free response limit/);
  });
  it("refuses any response on a tender mirror", async () => {
    await expect(
      db.query(`insert into rfp_interests (rfp_id, trade_organization_id, message) values ($1, $2, 'bid')`, [ids.mirror, ids.tradeOrg]),
    ).rejects.toThrow(/official portal/);
  });
});

describe("questions", () => {
  let q: string;
  it("the asker and the town read the question; another trade doesn't", async () => {
    q = ((await rows(`insert into town_job_questions (rfp_id, asker_user_id, asker_organization_id, question) values ($1, $2, $3, 'Do you need the WSIB letter at bid time? - Bob at Roofer') returning id`, [ids.rfq, ids.trade, ids.tradeOrg])) as { id: string }[])[0].id;
    expect(await asUser(db, ids.trade, () => rows(`select id from town_job_questions`))).toHaveLength(1);
    expect(await asUser(db, ids.clerk, () => rows(`select id from town_job_questions`))).toHaveLength(1);
    expect(await asUser(db, ids.other, () => rows(`select id from town_job_questions`))).toHaveLength(0);
    await expect(asUser(db, ids.trade, () => rows(`insert into town_job_questions (rfp_id, question) values ($1, 'sneaky question')`, [ids.rfq]))).rejects.toThrow(/permission denied/);
  });
  it("is published only once answered, without the asker, in the town's wording", async () => {
    expect(await asAnon(db, () => rows(`select * from town_job_qa_public`))).toEqual([]);
    await db.query(`update town_job_questions set answer = 'Yes, with your bid.', answered_at = now(), status = 'answered', public_question = 'Do you need the WSIB letter at bid time?' where id = $1`, [q]);
    const pub = await asAnon(db, () => rows(`select * from town_job_qa_public`));
    expect(pub).toHaveLength(1);
    expect(Object.keys(pub[0] as object).sort()).toEqual(["answer", "answered_at", "id", "question", "rfp_id"]);
    expect(pub[0]).toMatchObject({ question: "Do you need the WSIB letter at bid time?", answer: "Yes, with your bid." });
    expect(JSON.stringify(pub)).not.toMatch(/Bob|Roofer/);
    await expect(asAnon(db, () => rows(`select * from town_job_questions`))).rejects.toThrow(/permission denied/);
  });
  it("an answer is given once", async () => {
    await expect(db.query(`update town_job_questions set answer = 'Changed my mind' where id = $1`, [q])).rejects.toThrow(/answered once/);
  });
});

describe("addenda", () => {
  it("are numbered once, record a closing-date change, never edited, and public", async () => {
    await db.query(`insert into town_job_addenda (rfp_id, number, body, old_deadline, new_deadline) values ($1, 1, 'Closing moved a week later.', '2099-05-01', '2099-05-08')`, [ids.rfq]);
    await expect(db.query(`insert into town_job_addenda (rfp_id, number, body) values ($1, 1, 'Duplicate number')`, [ids.rfq])).rejects.toThrow();
    await expect(db.query(`insert into town_job_addenda (rfp_id, number, body, old_deadline) values ($1, 2, 'Half a change', '2099-05-01')`, [ids.rfq])).rejects.toThrow();
    await expect(db.query(`update town_job_addenda set body = 'rewritten' where rfp_id = $1`, [ids.rfq])).rejects.toThrow(/never edited/);
    expect(await asAnon(db, () => rows(`select number, old_deadline::text, new_deadline::text from town_job_addenda_public`))).toEqual([{ number: 1, old_deadline: "2099-05-01", new_deadline: "2099-05-08" }]);
  });
});

describe("invites", () => {
  it("one per address and per company per job, 50 a town per day", async () => {
    const add = (email: string, org: string | null = null) =>
      db.query(`insert into town_invites (rfp_id, organization_id, kind, trade_organization_id, email_key) values ($1, $2, $3, $4, $5)`, [ids.rfq, ids.town, org ? "trade" : "email", org, email]);
    await add("a@example.com", ids.tradeOrg);
    await expect(add("b@example.com", ids.tradeOrg)).rejects.toThrow();
    await expect(add("a@example.com")).rejects.toThrow();
    await expect(add("Upper@Example.com")).rejects.toThrow();
    for (let i = 0; i < 49; i++) await add(`c${i}@example.com`);
    await expect(add("over@example.com")).rejects.toThrow(/invite limit/);
    // Yesterday's don't count.
    expect(await rows(`select count(*)::int as n from town_invites where organization_id = $1`, [ids.town])).toEqual([{ n: 50 }]);
  });
  it("the town reads its invites; a trade doesn't", async () => {
    expect((await asUser(db, ids.clerk, () => rows(`select id from town_invites`))).length).toBe(50);
    expect(await asUser(db, ids.trade, () => rows(`select id from town_invites`))).toEqual([]);
  });
});

describe("the town's record", () => {
  it("is append-only, even for the server", async () => {
    await db.query(`insert into town_job_log (rfp_id, organization_id, event, detail) values ($1, $2, 'published', '{"auto":true}')`, [ids.rfq, ids.town]);
    await expect(db.query(`update town_job_log set event = 'x_x_x'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from town_job_log`)).rejects.toThrow(/append-only/);
    await expect(db.query(`truncate town_job_log`)).rejects.toThrow(/append-only/);
    await expect(db.query(`insert into town_job_log (event) values ('Bad Event!')`)).rejects.toThrow();
    expect(await asUser(db, ids.clerk, () => rows(`select event from town_job_log`))).toEqual([{ event: "published" }]);
    expect(await asUser(db, ids.trade, () => rows(`select event from town_job_log`))).toEqual([]);
  });
});

describe("public views", () => {
  it("town posts: full public details, verified, no hidden contact; PM jobs never", async () => {
    const view = await asAnon(db, () => rows(`select slug, buyer_name, verified, post_kind, official_url, scope, contact_email from town_posts_public order by slug`));
    expect(view).toEqual([
      { slug: "arena-roof", buyer_name: "Town of Cobourg", verified: true, post_kind: "tender_mirror", official_url: "https://cobourg.bidsandtenders.ca/x", scope: null, contact_email: null },
      { slug: "grass-cutting-2027", buyer_name: "Town of Cobourg", verified: true, post_kind: "quote_request", official_url: null, scope: "Cut weekly", contact_email: null },
    ]);
  });
  it("a post from an organization that doesn't manage the page isn't verified", async () => {
    const other = randomUUID();
    await db.query(`insert into organizations (id, name, slug, organization_type) values ($1, 'Unverified', 'unverified-b2', 'public_buyer')`, [other]);
    await db.query(
      `insert into rfp_posts (title, slug, status, source_type, posted_by_organization_id, buyer_key, buyer_name, post_kind) values ('t', 'unverified-post', 'published', 'public_buyer_direct', $1, 'ontario/town-of-cobourg', 'Town of Cobourg', 'quote_request')`,
      [other],
    );
    expect(await asAnon(db, () => rows(`select verified from town_posts_public where slug = 'unverified-post'`))).toEqual([{ verified: false }]);
  });
});
