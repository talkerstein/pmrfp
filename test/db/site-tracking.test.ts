import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * First-party tracking (20261021000200): the batched writer, listing-view
 * dedupe per visitor per day, funnel events, the aggregated report,
 * 13-month retention, and who can read or write what.
 */
const ATTRIBUTION = "20261015000001_signup_attribution.sql";
const MIGRATION = "20261021000200_site_tracking.sql";
let db: PGlite;
const ids = { admin: randomUUID(), pm: randomUUID(), trade: randomUUID(), org: randomUUID(), rfp: randomUUID(), rfp2: randomUUID() };
const H1 = "1".repeat(32);
const H2 = "2".repeat(32);

const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const beacon = (p: unknown) => db.query(`select public.record_site_beacon($1::jsonb)`, [JSON.stringify(p)]);

beforeAll(async () => {
  db = await createTestDb([ATTRIBUTION, MIGRATION]);
  // Again after the harness's blanket test grants, so the migration's revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  for (const [id, name, role] of [[ids.admin, "Root", "admin"], [ids.pm, "Pam", "property_manager"], [ids.trade, "Tia", "trade"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name.toLowerCase()}@example.com`, JSON.stringify({ full_name: name, primary_role: role === "admin" ? "trade" : role })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(`insert into organizations (id, name, slug, organization_type, country) values ($1, 'Tia Roofing', 'tia-roofing', 'trade_company', 'United States')`, [ids.org]);
  await db.query(`insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')`, [ids.org, ids.trade]);
  await db.query(
    `insert into rfp_posts (id, title, slug, status, posted_by_user_id, deadline) values ($1, 'Roof repair', 'roof-repair-ab12', 'published', $2, current_date + 10), ($3, 'Snow', 'snow-cd34', 'published', $2, current_date + 10)`,
    [ids.rfp, ids.pm, ids.rfp2],
  );
});

describe("record_site_beacon: listing views", () => {
  it("keeps one view per listing per visitor per day", async () => {
    const view = (day: string, h: string, slug = "roof-repair-ab12") => ({ day, slug, h, user_id: null, country: "CA", lang: "en" });
    await beacon({ views: [view("2026-10-21", H1), view("2026-10-21", H1)] });
    await beacon({ views: [view("2026-10-21", H1)] }); // another instance, same visitor, same day
    await beacon({ views: [view("2026-10-21", H2), view("2026-10-22", H1), view("2026-10-21", H1, "snow-cd34")] });
    const r = await rows<{ slug: string; view_day: string; visitor_hash: string }>(
      `select p.slug, v.view_day::text, v.visitor_hash from rfp_views v join rfp_posts p on p.id = v.rfp_id order by 1, 2, 3`,
    );
    expect(r).toEqual([
      { slug: "roof-repair-ab12", view_day: "2026-10-21", visitor_hash: H1 },
      { slug: "roof-repair-ab12", view_day: "2026-10-21", visitor_hash: H2 },
      { slug: "roof-repair-ab12", view_day: "2026-10-22", visitor_hash: H1 },
      { slug: "snow-cd34", view_day: "2026-10-21", visitor_hash: H1 },
    ]);
  });

  it("ties a signed-in view to the account and its company, skips the poster's own views, admins and unknown listings", async () => {
    await beacon({
      views: [
        { day: "2026-10-23", slug: "roof-repair-ab12", h: "3".repeat(32), user_id: ids.trade, country: "US", lang: "en" },
        { day: "2026-10-23", slug: "roof-repair-ab12", h: "4".repeat(32), user_id: ids.pm, country: "CA", lang: "en" },
        { day: "2026-10-23", slug: "roof-repair-ab12", h: "5".repeat(32), user_id: ids.admin, country: "CA", lang: "en" },
        { day: "2026-10-23", slug: "no-such-listing", h: "6".repeat(32), user_id: null, country: "CA", lang: "en" },
        { day: "2026-10-23", slug: "roof-repair-ab12", h: "not-a-hash", user_id: null, country: "CA", lang: "en" },
      ],
    });
    const r = await rows(`select viewed_by_user_id, organization_id, country from rfp_views where view_day = '2026-10-23'`);
    expect(r).toEqual([{ viewed_by_user_id: ids.trade, organization_id: ids.org, country: "US" }]);
  });
});

describe("record_site_beacon: traffic and events", () => {
  it("counts each visitor once a day and sums page views and referrers", async () => {
    const day = "2026-10-20";
    await beacon({
      visitors: [{ day, h: H1, country: "CA", lang: "fr", signed_in: false }, { day, h: H1, country: "CA", lang: "fr", signed_in: true }],
      pages: [{ day, path: "/fr/rfps", country: "CA", n: 2 }],
      referrers: [{ day, host: "google.com", country: "CA", n: 1 }],
    });
    await beacon({ visitors: [{ day, h: H1, country: "CA", lang: "fr", signed_in: false }], pages: [{ day, path: "/fr/rfps", country: "CA", n: 3 }], referrers: [{ day, host: "google.com", country: "CA", n: 2 }] });
    expect(await rows(`select country, lang, signed_in from site_visitors where day = $1`, [day])).toEqual([{ country: "CA", lang: "fr", signed_in: true }]);
    expect(await rows(`select views from site_page_views where day = $1 and path = '/fr/rfps'`, [day])).toEqual([{ views: 5 }]);
    expect(await rows(`select visits from site_referrers where day = $1`, [day])).toEqual([{ visits: 3 }]);
  });

  it("keeps known events only, fills the role from the account and the country from the company", async () => {
    const at = new Date().toISOString();
    await beacon({
      events: [
        { event: "upgrade_clicked", path: "/pricing", user_id: ids.trade, anon_hash: H1, props: { plan: "pro" }, at },
        { event: "signup_completed", role: "property_manager", country: "CA", user_id: ids.pm, at },
        { event: "page_hacked", path: "/" },
        { event: "pricing_viewed", path: "not-a-path", country: "Canada", anon_hash: "x", props: [1, 2] },
      ],
    });
    const r = await rows<{ event: string; role: string | null; country: string | null; path: string | null; anon_hash: string | null; props: unknown }>(
      `select event, role, country, path, anon_hash, props from site_events order by event`,
    );
    expect(r).toEqual([
      { event: "pricing_viewed", role: null, country: null, path: null, anon_hash: null, props: {} },
      { event: "signup_completed", role: "property_manager", country: "CA", path: null, anon_hash: null, props: {} },
      { event: "upgrade_clicked", role: "trade", country: "US", path: "/pricing", anon_hash: H1, props: { plan: "pro" } },
    ]);
  });
});

describe("site_analytics_report", () => {
  it("aggregates visitors, pages, sign-ups by source and funnel steps by market", async () => {
    const today = (await rows<{ d: string }>(`select current_date::text as d`))[0].d;
    await beacon({
      visitors: [{ day: today, h: "7".repeat(32), country: "CA", lang: "en", signed_in: false }, { day: today, h: "8".repeat(32), country: "US", lang: "en", signed_in: false }],
      pages: [{ day: today, path: "/rfps", country: "CA", n: 4 }, { day: today, path: "/pricing", country: "US", n: 1 }],
      events: [
        { event: "signup_started", country: "CA", anon_hash: "7".repeat(32) },
        { event: "signup_started", country: "CA", anon_hash: "7".repeat(32) },
        { event: "signup_started", country: "US", anon_hash: "8".repeat(32) },
      ],
    });
    await db.query(`insert into signup_attribution (user_id, channel, country, method, role) values ($1, 'google_organic', 'CA', 'magic_link', 'property_manager'), ($2, 'email', 'US', 'google', null)`, [ids.pm, ids.trade]);
    const r = (await rows<{ r: Record<string, unknown> }>(`select public.site_analytics_report(current_date - 6, current_date) as r`))[0].r as {
      daily: { market: string; visitors: number; page_views: number }[];
      top_pages: { market: string; path: string }[];
      signups: { market: string; channel: string; method: string; role: string; n: number }[];
      events: { market: string; event: string; actors: number; n: number }[];
    };
    expect(r.daily).toEqual(expect.arrayContaining([expect.objectContaining({ market: "CA", visitors: 1, page_views: 4 }), expect.objectContaining({ market: "US", visitors: 1, page_views: 1 })]));
    expect(r.top_pages).toEqual(expect.arrayContaining([expect.objectContaining({ market: "CA", path: "/rfps" })]));
    expect(r.signups).toEqual(expect.arrayContaining([
      { market: "CA", channel: "google_organic", method: "magic_link", role: "property_manager", n: 1 },
      { market: "US", channel: "email", method: "google", role: "trade", n: 1 },
    ]));
    const started = r.events.filter((e) => e.event === "signup_started");
    expect(started).toEqual(expect.arrayContaining([expect.objectContaining({ market: "CA", actors: 1, n: 2 }), expect.objectContaining({ market: "US", actors: 1, n: 1 })]));
  });
});

describe("retention", () => {
  it("purges what's older than 13 months and never less, whatever is asked", async () => {
    await db.query(`insert into site_events (event, created_at) values ('pricing_viewed', now() - interval '14 months'), ('pricing_viewed', now() - interval '2 months')`);
    await db.query(`insert into site_visitors (day, visitor_hash) values ((now() - interval '14 months')::date, $1)`, ["9".repeat(32)]);
    await db.query(`insert into rfp_views (rfp_id, view_day, visitor_hash, created_at) values ($1, (now() - interval '14 months')::date, $2, now() - interval '14 months')`, [ids.rfp2, "9".repeat(32)]);
    const before = Number((await rows<{ n: number }>(`select count(*)::int as n from site_events`))[0].n);
    const out = (await rows<{ r: { events: number; visitors: number; views: number } }>(`select public.purge_site_tracking(1) as r`))[0].r;
    expect(out).toMatchObject({ events: 1, visitors: 1, views: 1 });
    expect(Number((await rows<{ n: number }>(`select count(*)::int as n from site_events`))[0].n)).toBe(before - 1);
    // The 2-month-old event survives even though 1 month was asked for.
    expect(await rows(`select 1 from site_events where created_at < now() - interval '1 month'`)).toHaveLength(1);
  });
});

describe("access", () => {
  it("only admins read tracking tables; nobody but the server writes them", async () => {
    for (const t of ["site_events", "site_visitors", "site_page_views", "site_referrers"]) {
      await expect(asAnon(db, () => rows(`select * from ${t}`))).rejects.toThrow(/permission denied/);
      expect(await asUser(db, ids.trade, () => rows(`select * from ${t}`))).toHaveLength(0);
      expect((await asUser(db, ids.admin, () => rows(`select * from ${t}`))).length).toBeGreaterThan(0);
      await expect(asUser(db, ids.admin, () => db.query(`delete from ${t}`))).rejects.toThrow(/permission denied/);
    }
  });

  it("visitors can't write listing views directly any more, or call the server functions", async () => {
    await expect(asAnon(db, () => db.query(`insert into rfp_views (rfp_id) values ($1)`, [ids.rfp]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.trade, () => db.query(`insert into rfp_views (rfp_id) values ($1)`, [ids.rfp]))).rejects.toThrow(/permission denied/);
    for (const fn of [`public.record_site_beacon('{}'::jsonb)`, `public.purge_site_tracking(13)`, `public.site_analytics_report(current_date, current_date)`]) {
      await expect(asAnon(db, () => db.query(`select ${fn}`))).rejects.toThrow(/permission denied/);
      await expect(asUser(db, ids.admin, () => db.query(`select ${fn}`))).rejects.toThrow(/permission denied/);
    }
  });

  it("signup_attribution takes the new methods and the role, and still rejects junk", async () => {
    const u = randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1, 'new@example.com')`, [u]);
    await db.query(`insert into signup_attribution (user_id, method, role, opted_out) values ($1, 'password', 'trade', true)`, [u]);
    await expect(db.query(`insert into signup_attribution (user_id, method) values ($1, 'carrier')`, [ids.admin])).rejects.toThrow();
    await expect(db.query(`insert into signup_attribution (user_id, role) values ($1, 'Admin; drop')`, [ids.admin])).rejects.toThrow();
  });
});
