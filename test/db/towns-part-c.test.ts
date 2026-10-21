import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";
import { townClosesAt } from "@/lib/town-jobs/sealed";
import { awardHistoryRow } from "@/lib/town-jobs/results";

/**
 * Towns, Part C (20261021000120) against real Postgres (PGlite): the sealed
 * box is out of every API role's reach (the service role included), the town
 * and admins see a count only, trades send / replace / withdraw their own
 * until closing, late quotes are refused and logged, the opening needs two
 * different members (or a named witness with a one-time link), break-glass is
 * audited and told to the town, the guards hold for every role, the public
 * views, results and the award history row.
 */
const MIGRATION = "20261021000120_towns_part_c.sql";
let db: PGlite;
const ids = {
  clerk: randomUUID(),
  deputy: randomUUID(),
  solo: randomUUID(),
  tradeA: randomUUID(),
  tradeB: randomUUID(),
  nosy: randomUUID(),
  admin: randomUUID(),
  town: randomUUID(),
  soloTown: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  orgNosy: randomUUID(),
  open: randomUUID(),
  closed: randomUUID(),
  lapse: randomUUID(),
  soloPost: randomUUID(),
  plain: randomUUID(),
  glass: randomUUID(),
};
const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await rows<T>(sql, params))[0];

/** As the server: the service role, no signed-in JWT (it vouches for p_actor). */
async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  await db.exec("set role service_role;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
const call = (fn: string, args: unknown[]) => asService(async () => (await one<{ r: Record<string, unknown> | null }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args)).r);
const submit = (rfp: string, actor: string, org: string, amount: number | null, message = "We can do it") =>
  call("sealed_quote_submit", [rfp, actor, org, message, null, null, amount, amount == null ? null : "firm", "Includes disposal", "2027-05-01", [], "en"]);
const logOf = (rfp: string) => rows<{ event: string; actor_user_id: string | null; detail: Record<string, unknown> }>(`select event, actor_user_id, detail from town_job_log where rfp_id = $1 order by id`, [rfp]);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

beforeAll(async () => {
  db = await createTestDb([
    "20260924000002_gc_packages.sql",
    "20261007000001_landlord.sql",
    "20261017000001_intel_access.sql",
    "20261017000040_award_history.sql",
    "20261019000001_dedupe_signups.sql",
    "20261021000020_pm_job_flow.sql",
    "20261021000040_public_buyer_towns.sql",
    "20261021000060_towns_part_b2.sql",
    MIGRATION,
  ]);
  // Again after the harness's blanket test grants, so the revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  // The portfolio migration's column (it needs tables this test doesn't load).
  await db.exec(`alter table rfp_interests add column if not exists case_study_ids uuid[] not null default '{}'`);
  const mkUser = (id: string, role: string, email: string, name: string) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ primary_role: role, full_name: name })]);
  await mkUser(ids.clerk, "public_buyer", "clerk@cobourg.ca", "Carla Clerk");
  await mkUser(ids.deputy, "public_buyer", "deputy@cobourg.ca", "Dan Deputy");
  await mkUser(ids.solo, "public_buyer", "cao@solo.ca", "Sam Solo");
  await mkUser(ids.tradeA, "trade", "a@roofer.ca", "Ann Roofer");
  await mkUser(ids.tradeB, "trade", "b@paver.ca", "Ben Paver");
  await mkUser(ids.nosy, "trade", "nosy@example.com", "Nosy Parker");
  await mkUser(ids.admin, "trade", "root@pmrfp.com", "Root Admin");
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(
    `insert into organizations (id, name, slug, organization_type, profile_status) values
      ($1, 'Town of Cobourg', 'cobourg-c', 'public_buyer', 'approved'), ($2, 'Village of Solo', 'solo-c', 'public_buyer', 'approved'),
      ($3, 'Acme Roofing Ltd', 'acme-c', 'trade_company', 'approved'), ($4, 'Best Paving Inc', 'best-c', 'trade_company', 'approved'),
      ($5, 'Nosy Contracting', 'nosy-c', 'trade_company', 'approved')`,
    [ids.town, ids.soloTown, ids.orgA, ids.orgB, ids.orgNosy],
  );
  await db.query(
    `insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($4, $5, 'owner'), ($6, $7, 'owner'), ($8, $9, 'owner'), ($10, $11, 'owner')`,
    [ids.town, ids.clerk, ids.deputy, ids.soloTown, ids.solo, ids.orgA, ids.tradeA, ids.orgB, ids.tradeB, ids.orgNosy, ids.nosy],
  );
  await db.query(
    `insert into buyer_pages (buyer_key, province_code, buyer_name, organization_id, verified_method) values
      ('ontario/town-of-cobourg', 'ON', 'Town of Cobourg', $1, 'email_domain'), ('british-columbia/village-of-solo', 'BC', 'Village of Solo', $2, 'email_domain')`,
    [ids.town, ids.soloTown],
  );
  const post = (id: string, slug: string, deadline: string, org: string, poster: string, key: string, sealed = true) =>
    db.query(
      `insert into rfp_posts (id, title, slug, summary, scope, status, source_type, posted_by_user_id, posted_by_organization_id, published_at, buyer_key, buyer_name, post_kind, deadline, sealed, province)
       values ($1, $2, $2, 'Summary', 'Scope', 'published', 'public_buyer_direct', $3, $4, now(), $5, 'Town', 'quote_request', $6, $7, 'Ontario')`,
      [id, slug, poster, org, key, deadline, sealed],
    );
  await post(ids.open, "open-box", "2099-05-01", ids.town, ids.clerk, "ontario/town-of-cobourg");
  await post(ids.closed, "closed-box", "2020-01-10", ids.town, ids.clerk, "ontario/town-of-cobourg");
  await post(ids.lapse, "lapse-box", "2020-01-10", ids.town, ids.clerk, "ontario/town-of-cobourg");
  await post(ids.soloPost, "solo-box", "2020-01-10", ids.soloTown, ids.solo, "british-columbia/village-of-solo");
  await post(ids.glass, "glass-box", "2099-05-01", ids.town, ids.clerk, "ontario/town-of-cobourg");
  await post(ids.plain, "plain-rfq", "2099-05-01", ids.town, ids.clerk, "ontario/town-of-cobourg", false);
  // Quotes that arrived before closing (the database's own clock can't go back, so they're placed directly).
  const placed = (rfp: string, org: string, user: string, amount: number | null, status = "active") =>
    db.query(
      `insert into sealed_box.quotes (rfp_id, trade_organization_id, submitted_by_user_id, status, message, quote_amount, quote_kind, start_date, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, '2020-02-01', '2020-01-09 10:00+00')`,
      [rfp, org, user, status, status === "withdrawn" ? null : "Our price", status === "withdrawn" ? null : amount, status === "withdrawn" || amount == null ? null : "firm"],
    );
  await placed(ids.closed, ids.orgA, ids.tradeA, 41000);
  await placed(ids.closed, ids.orgB, ids.tradeB, 38500);
  await placed(ids.closed, ids.orgNosy, ids.nosy, null, "withdrawn");
  await placed(ids.lapse, ids.orgA, ids.tradeA, 9000);
  await placed(ids.soloPost, ids.orgA, ids.tradeA, 12000);
  await placed(ids.soloPost, ids.orgB, ids.tradeB, 15500);
});
afterAll(async () => {
  await db?.close();
});

describe("the box is out of every API role's reach", () => {
  it("no role has the schema; the service role can't read or write the quotes", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect((await one<{ ok: boolean }>(`select has_schema_privilege($1, 'sealed_box', 'USAGE') as ok`, [role])).ok).toBe(false);
    }
    await expect(asService(() => db.query(`select * from sealed_box.quotes`))).rejects.toThrow(/permission denied/);
    await expect(asService(() => db.query(`update sealed_box.openings set status = 'opened'`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.clerk, () => db.query(`select * from sealed_box.quotes`))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => db.query(`select * from sealed_box.quotes`))).rejects.toThrow(/permission denied/);
  });
  it("signed-in people (the town included) can't call the box's functions directly", async () => {
    await expect(asUser(db, ids.clerk, () => db.query(`select public.sealed_box_state($1, $2)`, [ids.closed, ids.clerk]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.admin, () => db.query(`select public.sealed_break_glass($1, $2, 'a long enough reason')`, [ids.closed, ids.admin]))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => db.query(`select public.sealed_open_witness($1, 'x', 'Me')`, [ids.soloPost]))).rejects.toThrow(/permission denied/);
  });
  it("nothing (not even the service role) puts a response on a sealed post before it's opened", async () => {
    await expect(
      asService(() => db.query(`insert into rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message) values ($1, $2, $3, 'sneaky')`, [ids.open, ids.orgA, ids.tradeA])),
    ).rejects.toThrow(/sealed until closing/);
    await expect(db.query(`insert into rfp_interests (rfp_id, trade_organization_id, message) values ($1, $2, 'superuser too')`, [ids.closed, ids.orgA])).rejects.toThrow(/sealed/);
    // A post that isn't sealed keeps today's behaviour.
    await asService(() => db.query(`insert into rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message, quote_amount) values ($1, $2, $3, 'hi', 500)`, [ids.plain, ids.orgA, ids.tradeA]));
  });
});

describe("sending, replacing and withdrawing before closing", () => {
  it("a trade sends a quote; the town and an admin see a count and nothing else", async () => {
    const res = await submit(ids.open, ids.tradeA, ids.orgA, 25000);
    expect(res).toMatchObject({ ok: true, action: "received", version: 1 });
    for (const who of [ids.clerk, ids.admin]) {
      const state = (await call("sealed_box_state", [ids.open, who])) as Record<string, unknown>;
      expect(state).toMatchObject({ sealed: true, received: 1, closed: false, opening: null });
      const text = JSON.stringify(state);
      expect(text).not.toMatch(/25000|Acme|Ann Roofer|disposal|We can do it/);
      expect(text).not.toContain(ids.orgA);
      expect(text).not.toContain(ids.tradeA);
    }
    // Nobody outside the town (or admins) gets even the count.
    expect(await call("sealed_box_state", [ids.open, ids.nosy])).toBeNull();
  });
  it("only the trade's own people see its quote (not the town, not an admin, not a rival)", async () => {
    expect(await call("sealed_quote_own", [ids.open, ids.tradeA, ids.orgA])).toMatchObject({ status: "active", quote_amount: 25000, quote_kind: "firm" });
    for (const who of [ids.clerk, ids.admin, ids.nosy]) expect(await call("sealed_quote_own", [ids.open, who, ids.orgA])).toBeNull();
    // A signed-in JWT must be the same person the server names.
    const mismatch = await asUser(db, ids.nosy, async () => {
      await db.exec("reset role;");
      await db.exec("set role service_role;");
      return (await one<{ r: unknown }>(`select public.sealed_quote_own($1, $2, $3) as r`, [ids.open, ids.tradeA, ids.orgA])).r;
    });
    expect(mismatch).toBeNull();
  });
  it("replaces it before closing (a new version), then withdraws it (erased), then sends again", async () => {
    expect(await submit(ids.open, ids.tradeA, ids.orgA, 23500)).toMatchObject({ ok: true, action: "replaced", version: 2 });
    expect(await call("sealed_quote_own", [ids.open, ids.tradeA, ids.orgA])).toMatchObject({ quote_amount: 23500, version: 2 });
    expect(await call("sealed_quote_withdraw", [ids.open, ids.tradeA, ids.orgA])).toMatchObject({ ok: true });
    const gone = (await call("sealed_quote_own", [ids.open, ids.tradeA, ids.orgA])) as Record<string, unknown>;
    expect(gone).toMatchObject({ status: "withdrawn", message: null, quote_amount: null, quote_notes: null });
    expect(await call("sealed_box_state", [ids.open, ids.clerk])).toMatchObject({ received: 0, withdrawn: 1 });
    expect(await call("sealed_quote_withdraw", [ids.open, ids.tradeA, ids.orgA])).toMatchObject({ ok: false, error: "not_found" });
    expect(await submit(ids.open, ids.tradeA, ids.orgA, 24000)).toMatchObject({ ok: true, action: "received", version: 3 });
    expect(await submit(ids.open, ids.tradeB, ids.orgB, 26000)).toMatchObject({ ok: true, action: "received" });
    expect(await call("sealed_box_state", [ids.open, ids.clerk])).toMatchObject({ received: 2 });
  });
  it("the record logs every step with no identity while sealed", async () => {
    const log = await logOf(ids.open);
    expect(log.map((l) => l.event)).toEqual(["sealed_quote_received", "sealed_quote_replaced", "sealed_quote_withdrawn", "sealed_quote_received", "sealed_quote_received"]);
    for (const l of log) {
      expect(l.actor_user_id).toBeNull();
      expect(Object.keys(l.detail).sort()).toEqual(["quote", "version"]);
    }
  });
  it("refuses the town's own people, a rival acting for another company, and bad input", async () => {
    expect(await submit(ids.open, ids.clerk, ids.town, 1)).toMatchObject({ ok: false, error: "own_job" });
    expect(await submit(ids.open, ids.nosy, ids.orgA, 1)).toMatchObject({ ok: false, error: "not_member" });
    expect(await submit(ids.open, ids.tradeA, ids.orgA, 1, "   ")).toMatchObject({ ok: false, error: "invalid" });
    expect(await submit(ids.plain, ids.tradeA, ids.orgA, 1)).toMatchObject({ ok: false, error: "not_sealed" });
  });
});

describe("late quotes", () => {
  it("are refused after closing, and the refusal is logged without identity", async () => {
    expect(await submit(ids.closed, ids.tradeA, ids.orgA, 1000)).toMatchObject({ ok: false, error: "late" });
    expect(await submit(ids.closed, ids.nosy, ids.orgNosy, 1000)).toMatchObject({ ok: false, error: "late" });
    expect(await call("sealed_quote_withdraw", [ids.closed, ids.tradeA, ids.orgA])).toMatchObject({ ok: false, error: "late" });
    const late = (await logOf(ids.closed)).filter((l) => l.event === "sealed_quote_late");
    expect(late).toHaveLength(2);
    expect(late.every((l) => l.actor_user_id === null && Object.keys(l.detail).join() === "closes_at")).toBe(true);
    // The box still holds the two quotes from before closing, unchanged.
    expect(await call("sealed_box_state", [ids.closed, ids.clerk])).toMatchObject({ received: 2, closed: true });
  });
});

describe("the two-person opening", () => {
  it("can't start before closing, by an admin, or by someone outside the town", async () => {
    expect(await call("sealed_open_request", [ids.open, ids.clerk, null, null, null])).toMatchObject({ ok: false, error: "not_closed" });
    expect(await call("sealed_open_request", [ids.closed, ids.admin, null, null, null])).toMatchObject({ ok: false, error: "not_member" });
    expect(await call("sealed_open_request", [ids.closed, ids.tradeA, null, null, null])).toMatchObject({ ok: false, error: "not_member" });
    // A town of two can't swap the colleague for a witness.
    expect(await call("sealed_open_request", [ids.closed, ids.clerk, "My Friend", "friend@example.com", sha("t")])).toMatchObject({ ok: false, error: "use_colleague" });
  });
  it("one person alone can't open: asking and confirming yourself is refused, and nothing unseals", async () => {
    expect(await call("sealed_open_request", [ids.closed, ids.clerk, null, null, null])).toMatchObject({ ok: true, witness: false, members: 2 });
    expect(await call("sealed_open_request", [ids.closed, ids.deputy, null, null, null])).toMatchObject({ ok: false, error: "pending" });
    expect(await call("sealed_open_confirm", [ids.closed, ids.clerk])).toMatchObject({ ok: false, error: "same_person" });
    expect(await call("sealed_open_confirm", [ids.closed, ids.admin])).toMatchObject({ ok: false, error: "not_member" });
    expect(await call("sealed_open_confirm", [ids.closed, ids.tradeA])).toMatchObject({ ok: false, error: "not_member" });
    expect(await one(`select count(*)::int as n from rfp_interests where rfp_id = $1`, [ids.closed])).toEqual({ n: 0 });
    const state = (await call("sealed_box_state", [ids.closed, ids.deputy])) as { opening: Record<string, unknown> };
    expect(state.opening).toMatchObject({ status: "requested", requested_by: ids.clerk, requested_by_name: "Carla Clerk", opened_at: null });
  });
  it("a second, different member confirms and the quotes become responses (withdrawn ones stay erased)", async () => {
    expect(await call("sealed_open_confirm", [ids.closed, ids.deputy])).toMatchObject({ ok: true, opened: 2 });
    const opened = await rows<{ trade_organization_id: string; quote_amount: string; quote_kind: string; used_free_allowance: boolean }>(
      `select trade_organization_id, quote_amount::text, quote_kind, used_free_allowance from rfp_interests where rfp_id = $1 order by quote_amount`,
      [ids.closed],
    );
    expect(opened.map((o) => [o.trade_organization_id, o.quote_amount, o.quote_kind, o.used_free_allowance])).toEqual([
      [ids.orgB, "38500", "firm", false],
      [ids.orgA, "41000", "firm", false],
    ]);
    // Now the town reads them as itself (row level security), like any response.
    expect(await asUser(db, ids.clerk, () => rows(`select id from rfp_interests where rfp_id = $1`, [ids.closed]))).toHaveLength(2);
    const state = (await call("sealed_box_state", [ids.closed, ids.clerk])) as { opening: Record<string, unknown> };
    expect(state.opening).toMatchObject({ status: "opened", confirmed_by: ids.deputy, confirmed_by_name: "Dan Deputy", confirmed_method: "member" });
    expect(await call("sealed_open_confirm", [ids.closed, ids.deputy])).toMatchObject({ ok: false, error: "already_open" });
    const log = await logOf(ids.closed);
    const events = log.map((l) => l.event);
    expect(events.slice(-3)).toEqual(["opening_requested", "opening_confirmed", "quotes_opened"]);
    expect(log.find((l) => l.event === "opening_requested")?.actor_user_id).toBe(ids.clerk);
    expect(log.find((l) => l.event === "opening_confirmed")?.actor_user_id).toBe(ids.deputy);
    const map = log.find((l) => l.event === "quotes_opened")!.detail as { count: number; responses: { quote: string; response: string }[] };
    expect(map.count).toBe(2);
    expect(map.responses).toHaveLength(2);
    // Late quotes are still refused once it's open.
    expect(await submit(ids.closed, ids.tradeA, ids.orgA, 1)).toMatchObject({ ok: false, error: "late" });
  });
  it("a request lapses after 7 days: confirming then is refused and logged, and a new request starts over", async () => {
    expect(await call("sealed_open_request", [ids.lapse, ids.clerk, null, null, null])).toMatchObject({ ok: true });
    await db.query(`update sealed_box.openings set expires_at = now() - interval '1 minute' where rfp_id = $1`, [ids.lapse]);
    expect(await call("sealed_open_confirm", [ids.lapse, ids.deputy])).toMatchObject({ ok: false, error: "expired" });
    expect((await logOf(ids.lapse)).map((l) => l.event)).toContain("opening_expired");
    expect(await one(`select count(*)::int as n from rfp_interests where rfp_id = $1`, [ids.lapse])).toEqual({ n: 0 });
    expect(await call("sealed_open_request", [ids.lapse, ids.deputy, null, null, null])).toMatchObject({ ok: true });
    expect(await call("sealed_open_cancel", [ids.lapse, ids.clerk])).toMatchObject({ ok: true });
    expect(await call("sealed_open_confirm", [ids.lapse, ids.clerk])).toMatchObject({ ok: false, error: "no_request" });
    expect((await logOf(ids.lapse)).map((l) => l.event).slice(-1)).toEqual(["opening_cancelled"]);
  });
});

describe("a one-person town opens with a named witness", () => {
  const token = "witness-token-0123456789abcdef";
  it("needs a witness, who can't be the clerk themselves", async () => {
    expect(await call("sealed_open_request", [ids.soloPost, ids.solo, null, null, null])).toMatchObject({ ok: false, error: "needs_witness" });
    expect(await call("sealed_open_request", [ids.soloPost, ids.solo, "Sam Again", "CAO@solo.ca", sha(token)])).toMatchObject({ ok: false, error: "witness_self" });
    expect(await call("sealed_open_request", [ids.soloPost, ids.solo, "W", "w@example.com", sha(token)])).toMatchObject({ ok: false, error: "witness_name" });
    expect(await call("sealed_open_request", [ids.soloPost, ids.solo, "Wendy Witness", "Wendy@Council.ca", sha(token)])).toMatchObject({ ok: true, witness: true, members: 1 });
    // The clerk can't confirm their own request.
    expect(await call("sealed_open_confirm", [ids.soloPost, ids.solo])).toMatchObject({ ok: false, error: "same_person" });
  });
  it("the link is checked against its hash, works once, and opens the box", async () => {
    expect(await call("sealed_witness_info", [ids.soloPost, "wrong"])).toMatchObject({ ok: false, error: "bad_link" });
    expect(await call("sealed_witness_info", [ids.soloPost, token])).toMatchObject({ ok: true, received: 2, witness_name: "Wendy Witness", requested_by_name: "Sam Solo" });
    expect(JSON.stringify(await call("sealed_witness_info", [ids.soloPost, token]))).not.toMatch(/12000|Acme|Best Paving/);
    expect(await call("sealed_open_witness", [ids.soloPost, "wrong", "Wendy Witness"])).toMatchObject({ ok: false, error: "bad_link" });
    expect(await one(`select count(*)::int as n from rfp_interests where rfp_id = $1`, [ids.soloPost])).toEqual({ n: 0 });
    expect(await call("sealed_open_witness", [ids.soloPost, token, "Wendy Witness"])).toMatchObject({ ok: true, opened: 2 });
    expect(await call("sealed_open_witness", [ids.soloPost, token, "Wendy Witness"])).toMatchObject({ ok: false, error: "bad_link" });
    expect(await one(`select count(*)::int as n from rfp_interests where rfp_id = $1`, [ids.soloPost])).toEqual({ n: 2 });
    const log = await logOf(ids.soloPost);
    expect(log.find((l) => l.event === "opening_witnessed")?.detail).toEqual({ witness: "Wendy Witness" });
    expect((await one<{ witness_token_hash: string | null }>(`select witness_token_hash from sealed_box.openings where rfp_id = $1`, [ids.soloPost])).witness_token_hash).toBeNull();
  });
});

describe("admin break-glass", () => {
  it("needs an admin and a written reason", async () => {
    await submit(ids.glass, ids.tradeB, ids.orgB, 77000);
    expect(await call("sealed_break_glass", [ids.glass, ids.clerk, "I want to peek early please"])).toMatchObject({ ok: false, error: "not_admin" });
    expect(await call("sealed_break_glass", [ids.glass, ids.admin, "because"])).toMatchObject({ ok: false, error: "reason" });
    expect((await logOf(ids.glass)).some((l) => l.event === "sealed_break_glass")).toBe(false);
  });
  it("shows the admin the quotes, logs it in the town's record and tells the town, without opening the box", async () => {
    const res = (await call("sealed_break_glass", [ids.glass, ids.admin, "Fraud report from the town's CAO, ticket 4411"])) as { ok: boolean; quotes: { company: string; quote_amount: number }[] };
    expect(res.ok).toBe(true);
    expect(res.quotes).toEqual([expect.objectContaining({ company: "Best Paving Inc", quote_amount: 77000 })]);
    const entry = (await logOf(ids.glass)).find((l) => l.event === "sealed_break_glass")!;
    expect(entry.actor_user_id).toBe(ids.admin);
    expect(entry.detail).toMatchObject({ reason: "Fraud report from the town's CAO, ticket 4411", count: 1, admin: "Root Admin" });
    // The town reads it in its own record (as itself), and both members were told.
    expect(await asUser(db, ids.deputy, () => rows(`select event from town_job_log where rfp_id = $1 and event = 'sealed_break_glass'`, [ids.glass]))).toHaveLength(1);
    expect((await rows(`select user_id from notifications where type = 'sealed_break_glass'`)).map((r) => r.user_id).sort()).toEqual([ids.clerk, ids.deputy].sort());
    expect(await one(`select count(*)::int as n from rfp_interests where rfp_id = $1`, [ids.glass])).toEqual({ n: 0 });
    expect(await call("sealed_box_state", [ids.glass, ids.clerk])).toMatchObject({ received: 1, opening: null });
  });
});

describe("guards that hold for every role", () => {
  it("a live post's sealed setting is fixed", async () => {
    await expect(asService(() => db.query(`update rfp_posts set sealed = false where id = $1`, [ids.open]))).rejects.toThrow(/sealed setting is fixed/);
    await expect(db.query(`update rfp_posts set sealed = true where id = $1`, [ids.plain])).rejects.toThrow(/sealed setting is fixed/);
    // Only a town's quote request can be sealed.
    await expect(
      db.query(`insert into rfp_posts (title, slug, source_type, buyer_key, post_kind, official_url, sealed) values ('t', $1, 'public_buyer_direct', 'ontario/town-of-cobourg', 'tender_mirror', 'https://x.ca/t', true)`, [randomUUID()]),
    ).rejects.toThrow(/rfp_posts_sealed_check/);
  });
  it("a closed box's date can't move (no keep-alive or addendum reopens it); an open one's can", async () => {
    await expect(asService(() => db.query(`update rfp_posts set deadline = '2099-01-01' where id = $1`, [ids.lapse]))).rejects.toThrow(/closing date can't move/);
    await asService(() => db.query(`update rfp_posts set deadline = '2099-06-01' where id = $1`, [ids.open]));
    await expect(asService(() => db.query(`update rfp_posts set buyer_key = 'alberta/town-of-x' where id = $1`, [ids.open]))).rejects.toThrow(/keeps its town/);
  });
});

describe("closing time and the public views", () => {
  it("closes at midnight local, the same instant as the app's townClosesAt", async () => {
    const cases: [string, string, string][] = [
      ["2026-10-30", "ontario/town-of-cobourg", "2026-10-31T04:00:00.000Z"],
      ["2026-12-15", "ontario/town-of-cobourg", "2026-12-16T05:00:00.000Z"],
      ["2026-10-30", "british-columbia/village-of-solo", "2026-10-31T07:00:00.000Z"],
      ["2026-10-30", "nova-scotia/town-of-wolfville", "2026-10-31T03:00:00.000Z"],
      ["2026-10-30", "saskatchewan/town-of-x", "2026-10-31T06:00:00.000Z"],
      ["2026-11-01", "newfoundland-and-labrador/town-of-y", "2026-11-02T03:30:00.000Z"],
    ];
    for (const [d, key, iso] of cases) {
      const r = await one<{ t: Date }>(`select public.town_closes_at($1::date, $2) as t`, [d, key]);
      expect(new Date(r.t).toISOString()).toBe(iso);
      expect(townClosesAt(d, key)).toBe(iso);
    }
  });
  it("anyone reads a sealed post's closing time and opening date, never a count", async () => {
    const pub = await asAnon(db, () => rows<{ rfp_id: string; closes_at: Date; opened_at: Date | null }>(`select * from town_sealed_public order by closes_at`));
    expect(Object.keys(pub[0]).sort()).toEqual(["closes_at", "opened_at", "rfp_id", "time_zone"]);
    expect(pub.find((p) => p.rfp_id === ids.closed)?.opened_at).not.toBeNull();
    expect(pub.find((p) => p.rfp_id === ids.open)?.opened_at).toBeNull();
  });
});

describe("results and the award", () => {
  it("a recommendation or award must be one of the post's own responses", async () => {
    const [mine] = await rows<{ id: string }>(`select id from rfp_interests where rfp_id = $1 limit 1`, [ids.closed]);
    const [other] = await rows<{ id: string }>(`select id from rfp_interests where rfp_id = $1 limit 1`, [ids.soloPost]);
    await expect(db.query(`insert into town_job_results (rfp_id, recommended_interest_id) values ($1, $2)`, [ids.closed, other.id])).rejects.toThrow(/own responses/);
    await db.query(`insert into town_job_results (rfp_id, organization_id, recommended_interest_id, rationale) values ($1, $2, $3, 'Lowest firm price, insured')`, [ids.closed, ids.town, mine.id]);
    // The town reads its own; another town's member (or a trade) doesn't.
    expect(await asUser(db, ids.clerk, () => rows(`select rfp_id from town_job_results`))).toHaveLength(1);
    expect(await asUser(db, ids.solo, () => rows(`select rfp_id from town_job_results`))).toHaveLength(0);
    expect(await asUser(db, ids.tradeA, () => rows(`select rfp_id from town_job_results`))).toHaveLength(0);
    await expect(asUser(db, ids.clerk, () => db.query(`update town_job_results set rationale = 'x' where rfp_id = $1`, [ids.closed]))).rejects.toThrow(/permission denied/);
  });
  it("the public award view hides the amount the town chose not to publish", async () => {
    await db.query(
      `update town_job_results set award_winner_name = 'Best Paving Inc', award_amount = 38500, award_amount_public = false, award_date = '2020-02-01', award_published_at = now() where rfp_id = $1`,
      [ids.closed],
    );
    expect(await asAnon(db, () => one(`select winner_name, amount from town_awards_public where rfp_id = $1`, [ids.closed]))).toEqual({ winner_name: "Best Paving Inc", amount: null });
    await db.query(`update town_job_results set award_amount_public = true where rfp_id = $1`, [ids.closed]);
    expect(await asAnon(db, () => one(`select amount::text from town_awards_public where rfp_id = $1`, [ids.closed]))).toEqual({ amount: "38500.00" });
  });
  it("the award history row the server writes fits award_history (the importers' shape)", async () => {
    const row = awardHistoryRow({
      rfpId: ids.closed,
      slug: "closed-box",
      title: "Arena roof patch",
      buyerName: "Town of Cobourg",
      province: "ON",
      city: "Cobourg",
      winnerName: "Best Paving Inc",
      amount: 38500,
      amountPublic: false,
      awardDate: "2020-02-01",
      startDate: "2020-02-01",
      quotes: 2,
      tradeSlugs: ["roofing"],
      today: "2026-10-21",
    })!;
    expect(row).not.toBeNull();
    await asService(() => db.query(`insert into award_history (${Object.keys(row).join(", ")}) values (${Object.keys(row).map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(row)));
    expect(await one(`select source, source_key, buyer, winner_business_name, value, number_of_bids, country, currency, province from award_history where source = 'pmrfp-towns'`)).toEqual({
      source: "pmrfp-towns",
      source_key: ids.closed,
      buyer: "Town of Cobourg",
      winner_business_name: "Best Paving Inc",
      value: null,
      number_of_bids: 2,
      country: "CA",
      currency: "CAD",
      province: "Ontario",
    });
  });
});
