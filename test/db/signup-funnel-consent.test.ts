import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * 20261022000100: the sign-up funnel's new events, the relabelling of old
 * page-view rows (safe to run twice), the report's `steps`, and the
 * email_consents table (server writes, members read their own).
 */
const ATTRIBUTION = "20261015000001_signup_attribution.sql";
const TRACKING = "20261021000200_site_tracking.sql";
const MIGRATION = "20261022000100_signup_funnel_and_consent.sql";
const sql = () => readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8");
let db: PGlite;
const ids = { admin: randomUUID(), a: randomUUID(), b: randomUUID() };
const H = (c: string) => c.repeat(32);

const rows = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) => (await db.query<T>(q, params)).rows;
const beacon = (p: unknown) => db.query(`select public.record_site_beacon($1::jsonb)`, [JSON.stringify(p)]);

beforeAll(async () => {
  db = await createTestDb([ATTRIBUTION, TRACKING]);
  for (const [id, name] of [[ids.admin, "Root"], [ids.a, "Ann"], [ids.b, "Bo"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name.toLowerCase()}@example.com`, JSON.stringify({ full_name: name, primary_role: "trade" })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);

  // What production holds today: "signup_started" rows that were page views (no method), plus one real submission written after the fix.
  await db.exec(`
    insert into site_events (event, country, anon_hash, props, created_at) values
      ('signup_started', 'CA', '${H("1")}', '{"role":"trade","plan":"pro"}', '2026-10-22T02:03:44Z'),
      ('signup_started', 'CA', '${H("1")}', '{"role":"trade","plan":null}',  '2026-10-22T02:03:53Z'),
      ('signup_started', 'US', '${H("2")}', '{}',                            '2026-10-22T09:44:42Z'),
      ('signup_started', 'CA', '${H("3")}', '{"method":"link","role":"trade"}', now());
  `);
  await db.exec(sql());
  await db.exec(sql()); // and again: nothing changes, nothing breaks
});

describe("old page-view rows become signup_viewed, real submissions stay signup_started", () => {
  it("relabels rows without a method, once", async () => {
    const r = await rows<{ event: string; n: number }>(`select event, count(*)::int n from site_events group by event order by event`);
    expect(r).toEqual([
      { event: "signup_started", n: 1 },
      { event: "signup_viewed", n: 3 },
    ]);
  });

  it("a submission recorded after the migration is not relabelled by a re-run", async () => {
    await beacon({ events: [{ event: "signup_started", props: { method: "password", role: "trade" }, anon_hash: H("4"), country: "US" }] });
    await db.exec(sql());
    const r = await rows<{ n: number }>(`select count(*)::int n from site_events where event = 'signup_started'`);
    expect(r[0].n).toBe(2);
  });
});

describe("the writer accepts the funnel's new events and still refuses unknown ones", () => {
  it("stores signup_viewed, signup_step, email_confirmed, onboarding_step and checkout_failed", async () => {
    await beacon({
      events: [
        { event: "signup_viewed", props: { role: "trade" }, anon_hash: H("5"), country: "CA", path: "/sign-up" },
        { event: "signup_step", props: { step: 2 }, anon_hash: H("5"), country: "CA", path: "/sign-up" },
        { event: "email_confirmed", props: { method: "link" }, user_id: ids.a, country: "CA" },
        { event: "onboarding_step", props: { step: "form_error", field: "website" }, user_id: ids.a, country: "CA" },
        { event: "checkout_failed", props: { plan: "pro", reason: "stripe_error" }, user_id: ids.a, country: "CA" },
        { event: "not_an_event", props: {}, anon_hash: H("6") },
      ],
    });
    const r = await rows<{ event: string }>(`select event from site_events where event in ('signup_step','email_confirmed','onboarding_step','checkout_failed') order by event`);
    expect(r.map((x) => x.event)).toEqual(["checkout_failed", "email_confirmed", "onboarding_step", "signup_step"]);
    expect(await rows(`select 1 from site_events where event = 'not_an_event'`)).toHaveLength(0);
  });

  it("the report lists where unfinished sign-ups stopped, per market", async () => {
    await beacon({
      events: [
        { event: "signup_step", props: { step: 1 }, anon_hash: H("7"), country: "CA" },
        { event: "signup_step", props: { step: 1 }, anon_hash: H("8"), country: "CA" },
        { event: "onboarding_step", props: { step: "form_error", field: "website" }, user_id: ids.b, country: "CA" },
      ],
    });
    const [{ r }] = await rows<{ r: { steps: { market: string; event: string; step: string; field: string; actors: number }[]; events: { event: string }[] } }>(
      `select public.site_analytics_report(current_date - 1, current_date + 1) as r`,
    );
    const step1 = r.steps.find((s) => s.market === "CA" && s.event === "signup_step" && s.step === "1");
    expect(step1?.actors).toBe(2);
    expect(r.steps.find((s) => s.event === "onboarding_step" && s.step === "form_error" && s.field === "website")?.actors).toBe(2); // Ann and Bo
    // The old keys are all still there.
    expect(r.events.some((e) => e.event === "signup_viewed")).toBe(true);
  });
});

describe("email_consents", () => {
  it("one row per person, scope and source; a repeat changes nothing", async () => {
    const add = () =>
      db.query(
        `insert into email_consents (user_id, scope, source, wording_version, lang) values ($1, 'service', 'signup_form', '2026-10-22.1', 'en') on conflict (user_id, scope, source) do nothing`,
        [ids.a],
      );
    await add();
    await add();
    await db.query(`insert into email_consents (user_id, scope, source, wording_version, lang) values ($1, 'marketing', 'onboarding', '2026-10-22.1', 'fr')`, [ids.a]);
    await db.query(`insert into email_consents (user_id, scope, source, wording_version) values ($1, 'service', 'onboarding', '2026-10-22.1')`, [ids.b]);
    expect(await rows(`select 1 from email_consents where user_id = $1`, [ids.a])).toHaveLength(2);
    await expect(db.query(`insert into email_consents (user_id, scope, source, wording_version) values ($1, 'everything', 'onboarding', 'v')`, [ids.a])).rejects.toThrow();
    await expect(db.query(`insert into email_consents (user_id, scope, source, wording_version) values ($1, 'service', 'phone_call', 'v')`, [ids.a])).rejects.toThrow();
  });

  it("members read only their own rows, admins read all, nobody else writes", async () => {
    await expect(asAnon(db, () => rows(`select * from email_consents`))).rejects.toThrow(/permission denied/);
    expect(await asUser(db, ids.a, () => rows(`select scope from email_consents`))).toHaveLength(2);
    expect(await asUser(db, ids.b, () => rows(`select scope from email_consents`))).toHaveLength(1);
    expect((await asUser(db, ids.admin, () => rows(`select scope from email_consents`))).length).toBe(3);
    await expect(asUser(db, ids.a, () => db.query(`insert into email_consents (user_id, scope, source, wording_version) values ($1, 'marketing', 'settings', 'v')`, [ids.a]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.a, () => db.query(`delete from email_consents`))).rejects.toThrow(/permission denied/);
  });
});
