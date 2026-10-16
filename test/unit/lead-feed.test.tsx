import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RfpListItem } from "@/lib/data/types";
import type { MajorProject } from "@/lib/major-projects/data";
import {
  areaOf,
  buildLeadProfile,
  isLiveLeadProject,
  isThinMarket,
  marketCounts,
  matchLeads,
  type Lead,
  type RegionRow,
  type TradeRow,
} from "@/lib/leads/match";
import { PROJECT_LEAD_TRADES, projectTradeMatch } from "@/lib/leads/trades";
import { FREE_LEAD_LIMIT, attachProjectPro, leadsForViewer } from "@/lib/leads/view";
import { isDue, leadAlertHtml, leadCadence, leadAlertsEnabled, pickLeadAlerts } from "@/lib/leads/alerts";
import {
  NO_TRIAL,
  TRIAL_DAYS,
  isDuplicateTrialError,
  isMissingTableError,
  isProEntitled,
  trialEndsAt,
  trialRefusal,
  trialState,
} from "@/lib/entitlement/trial";
import { startOrgTrial } from "@/lib/entitlement/server";
import { loadSessionContext, type SessionContext } from "@/lib/access/access";
import { LeadList } from "@/components/leads/lead-list";
import leadsMessages from "@/i18n/messages/leads";
import type { Organization } from "@/types/db";

const TODAY = "2026-10-15";

const REGIONS: RegionRow[] = [
  { id: "r-ca", slug: "canada", name: "Canada", province: null, country: "Canada", parent_id: null },
  { id: "r-on", slug: "ontario", name: "Ontario", province: "Ontario", country: "Canada", parent_id: "r-ca" },
  { id: "r-gta", slug: "greater-toronto-area", name: "Greater Toronto Area", province: "Ontario", country: "Canada", parent_id: "r-on" },
  { id: "r-tor", slug: "toronto", name: "Toronto", province: "Ontario", country: "Canada", parent_id: "r-gta" },
  { id: "r-mis", slug: "mississauga", name: "Mississauga", province: "Ontario", country: "Canada", parent_id: "r-gta" },
  { id: "r-ott", slug: "ottawa", name: "Ottawa", province: "Ontario", country: "Canada", parent_id: "r-on" },
  { id: "r-ab", slug: "alberta", name: "Alberta", province: "Alberta", country: "Canada", parent_id: "r-ca" },
  { id: "r-cal", slug: "calgary", name: "Calgary", province: "Alberta", country: "Canada", parent_id: "r-ab" },
  { id: "r-us", slug: "united-states", name: "United States", province: null, country: "USA", parent_id: null },
  { id: "r-tx", slug: "us-texas", name: "Texas", province: null, country: "USA", parent_id: "r-us" },
];

const TRADES: TradeRow[] = [
  { id: "t-paint", slug: "painting", name: "Painting" },
  { id: "t-mason", slug: "masonry", name: "Masonry" },
  { id: "t-snow", slug: "snow-removal", name: "Snow Removal" },
  { id: "t-elec", slug: "electrical", name: "Electrical" },
  { id: "t-gc", slug: "general-contracting", name: "General Contracting" },
  { id: "t-roof", slug: "roofing", name: "Roofing" },
];

function profile(p: { country?: "CA" | "US"; trades: string[]; regions: string[]; city?: string | null; province?: string | null }) {
  return buildLeadProfile({
    country: p.country ?? "CA",
    org: { city: p.city ?? null, province: p.province ?? null },
    tradeSlugs: p.trades,
    regionIds: p.regions,
    regions: REGIONS,
    trades: TRADES,
  });
}

function rfp(o: Partial<RfpListItem> & { slug: string }): RfpListItem {
  return {
    title: `Listing ${o.slug}`,
    summary: "Scope of work",
    categories: ["Painting"],
    regionName: "Toronto",
    propertyTypeName: null,
    city: "Toronto",
    province: "Ontario",
    deadline: "2026-10-30",
    isDemo: false,
    photoUrls: [],
    status: "open",
    sourceType: null,
    ...o,
  };
}

function award(slug: string, winner: string, o: Partial<RfpListItem> = {}): RfpListItem {
  return rfp({
    slug,
    title: `Contract ${slug}`,
    summary: `Awarded 2026-10-01 to ${winner} (Toronto) — $2,400,000 CAD. Past public contract from the City of Toronto.`,
    categories: ["General Contracting"],
    deadline: "2026-10-01",
    status: "closed",
    sourceType: "public_source",
    city: null,
    ...o,
  });
}

function mp(o: Partial<MajorProject> & { id: string }): MajorProject {
  return {
    slug: `project-${o.id}`,
    source: "ontario-builds",
    name: `Project ${o.id}`,
    description: "A new building",
    category: "commercial",
    owner: "City of Toronto",
    city: "Toronto",
    province: "Ontario",
    regionId: null,
    estValueCad: 40_000_000,
    size: null,
    status: "approved",
    statusRaw: "Approved",
    statusDate: "2026-09-01",
    timeline: null,
    tradesNeeded: ["general-contracting", "electrical", "hvac", "plumbing"],
    sources: [{ label: "Ontario Builds", url: "https://www.ontario.ca/page/ontario-builds" }],
    license: "OGL-Ontario",
    evidence: null,
    caveats: null,
    firstSeen: "2026-10-12",
    lastSeen: "2026-10-12",
    stale: false,
    staleSince: null,
    statusChangedAt: null,
    updatedAt: "2026-10-12T00:00:00Z",
    hasGc: false,
    hasBidRoute: false,
    sourceUpdated: null,
    linkGroup: null,
    ...o,
  };
}

describe("lead matcher: trade mapping", () => {
  it("a building project is a lead for finishing sub-trades even when the source only names MEP trades", () => {
    const p = mp({ id: "1" });
    expect(projectTradeMatch(p, new Set(["painting"]))).toEqual({ trades: ["painting"], match: "typical" });
    expect(projectTradeMatch(p, new Set(["masonry"]))?.match).toBe("typical");
    expect(projectTradeMatch(p, new Set(["electrical"]))).toEqual({ trades: ["electrical"], match: "named" });
    // Garage doors: buildings with parking, not a water main.
    expect(PROJECT_LEAD_TRADES.multi_residential.has("garage-doors")).toBe(true);
    expect(PROJECT_LEAD_TRADES.infrastructure.has("garage-doors")).toBe(false);
  });

  it("construction projects are not leads for after-construction services (snow removal)", () => {
    expect(projectTradeMatch(mp({ id: "1" }), new Set(["snow-removal"]))).toBeNull();
    const leads = matchLeads({ profile: profile({ trades: ["snow-removal"], regions: ["r-cal"], city: "Calgary" }), rfps: [], projects: [mp({ id: "1", city: "Calgary", province: "Alberta" })], today: TODAY });
    expect(leads).toEqual([]);
  });

  it("open bids match by trade name; a GC award is a lead for building sub-trades only", () => {
    const rfps = [
      rfp({ slug: "paint-bid" }),
      rfp({ slug: "roof-bid", categories: ["Roofing"] }),
      award("gc-win-tora-1", "Buildco Construction Ltd."),
    ];
    const painter = matchLeads({ profile: profile({ trades: ["painting"], regions: ["r-tor"] }), rfps, projects: [], today: TODAY });
    expect(painter.map((l) => l.key).sort()).toEqual(["rfp:gc-win-tora-1", "rfp:paint-bid"]);
    expect(painter.find((l) => l.kind === "award")?.pro?.contractor).toBe("Buildco Construction Ltd.");
    const snow = matchLeads({ profile: profile({ trades: ["snow-removal"], regions: ["r-tor"] }), rfps, projects: [], today: TODAY });
    expect(snow).toEqual([]);
  });

  it("skips finished, stale and old-permit projects; development applications get a longer window", () => {
    const today = TODAY;
    expect(isLiveLeadProject(mp({ id: "a", status: "completed" }), today)).toBe(false);
    expect(isLiveLeadProject(mp({ id: "b", stale: true }), today)).toBe(false);
    expect(isLiveLeadProject(mp({ id: "c", source: "permits-toronto", statusDate: "2024-01-01", firstSeen: "2024-01-02" }), today)).toBe(false);
    expect(isLiveLeadProject(mp({ id: "d", source: "permits-toronto", statusDate: "2026-06-01" }), today)).toBe(true);
    expect(isLiveLeadProject(mp({ id: "e", source: "apps-toronto", status: "application", statusDate: "2024-06-01", firstSeen: "2024-06-01" }), today)).toBe(true);
  });
});

describe("lead matcher: country separation", () => {
  const caProject = mp({ id: "ca1" });
  const usBid = rfp({ slug: "tx-paint", city: "Austin", regionName: "Texas", province: "Texas" });
  const caBid = rfp({ slug: "to-paint" });

  it("a U.S. company never gets Canadian projects or bids", () => {
    const us = profile({ country: "US", trades: ["painting"], regions: ["r-tx"] });
    const leads = matchLeads({ profile: us, rfps: [usBid, caBid], projects: [caProject], today: TODAY });
    expect(leads.map((l) => l.key)).toEqual(["rfp:tx-paint"]);
  });

  it("a Canadian company never gets U.S. bids, even when it also lists a U.S. region", () => {
    const ca = profile({ country: "CA", trades: ["painting"], regions: ["r-tor", "r-tx"] });
    expect([...ca.provinces]).toEqual(["Ontario"]);
    const leads = matchLeads({ profile: ca, rfps: [usBid, caBid], projects: [caProject], today: TODAY });
    expect(leads.map((l) => l.key).sort()).toEqual(["mp:ca1", "rfp:to-paint"]);
  });
});

describe("lead matcher: area ordering", () => {
  const mason = profile({ trades: ["masonry"], regions: ["r-ott", "r-gta"], city: "Ottawa", province: "Ontario" });

  it("classifies same city > same region > province, and drops what's outside", () => {
    expect(areaOf({ city: "Ottawa", province: "Ontario" }, mason)).toBe("city");
    expect(areaOf({ city: "Mississauga", province: "Ontario" }, mason)).toBe("region");
    expect(areaOf({ city: "Sudbury", province: "Ontario" }, mason)).toBe("province");
    expect(areaOf({ city: "Calgary", province: "Alberta" }, mason)).toBeNull();
  });

  it("sorts a same-city project above an otherwise identical one elsewhere in the province", () => {
    const projects = [
      mp({ id: "prov", city: "Sudbury" }),
      mp({ id: "city", city: "Ottawa" }),
      mp({ id: "reg", city: "Mississauga" }),
      mp({ id: "out", city: "Calgary", province: "Alberta" }),
    ];
    const leads = matchLeads({ profile: mason, rfps: [], projects, today: TODAY });
    expect(leads.map((l) => l.key)).toEqual(["mp:city", "mp:reg", "mp:prov"]);
    expect(leads.map((l) => l.area)).toEqual(["city", "region", "province"]);
  });

  it("counts honestly and flags a thin market", () => {
    const leads = matchLeads({ profile: mason, rfps: [], projects: [mp({ id: "city", city: "Ottawa" })], today: TODAY });
    const c = marketCounts(leads, TODAY);
    expect(c).toMatchObject({ openBids: 0, projects: 0, winners: 0, packages: 0, total: 1 }); // approved 2026-09-01: in the list, not "this month"
    expect(isThinMarket(c)).toBe(true);
    const fresh = matchLeads({ profile: mason, rfps: [], projects: [mp({ id: "p", city: "Ottawa", source: "permits-ottawa", statusDate: "2026-10-01" })], today: TODAY });
    expect(marketCounts(fresh, TODAY)).toMatchObject({ projects: 1, permits: 1, total: 1 });
  });
});

describe("graceful without the major-projects tables", () => {
  it("the snapshot is empty (not an error) when the view doesn't exist", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => false }));
    const failing = {
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "order", "limit", "gte", "gt", "lt", "abortSignal", "retry"]) b[m] = () => b;
        b.then = (ok: (v: unknown) => unknown) => ok({ data: null, error: { message: 'relation "public.major_projects_public" does not exist' } });
        return b;
      },
    };
    vi.doMock("@/lib/supabase/read", () => ({ createReadClient: () => failing }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getMajorProjects } = await import("@/lib/major-projects/data");
    await expect(getMajorProjects()).resolves.toEqual([]);
    warn.mockRestore();
    vi.doUnmock("@/lib/supabase/config");
    vi.doUnmock("@/lib/supabase/read");
  });

  it("the lead feed still works on bids and awards alone", () => {
    const leads = matchLeads({ profile: profile({ trades: ["painting"], regions: ["r-tor"] }), rfps: [rfp({ slug: "p1" })], projects: [], today: TODAY });
    expect(leads.map((l) => l.kind)).toEqual(["bid"]);
  });
});

describe("free vs Trade Pro lead fields", () => {
  const leads = matchLeads({
    profile: profile({ trades: ["painting"], regions: ["r-tor"] }),
    rfps: [rfp({ slug: "p1" }), rfp({ slug: "p2" }), award("gc-win-tora-1", "Secret Builders Inc.")],
    projects: [mp({ id: "g1", hasGc: true, hasBidRoute: true }), mp({ id: "g2" })],
    today: TODAY,
  });
  const withPro = attachProjectPro(leads, new Map([["g1", { generalContractor: "Hidden GC Ltd.", bidListUrl: "https://gc.example/prequal", bidRoute: "Email estimating" }]]));

  it("free members get a few leads and no Pro fields", () => {
    const free = leadsForViewer(withPro, false);
    expect(free).toHaveLength(FREE_LEAD_LIMIT);
    expect(free.every((l) => l.pro === null)).toBe(true);
    expect(free.filter((l) => l.kind === "award").every((l) => l.summary === null)).toBe(true);
  });

  it("no Pro-only value reaches a free member's HTML; Pro sees them", () => {
    const t = leadsMessages.en;
    const names = new Map([["painting", "Painting"]]);
    const freeHtml = renderToStaticMarkup(<LeadList leads={leadsForViewer(withPro, false, 10)} t={t} lang="en" tradeNames={names} />);
    for (const secret of ["Secret Builders", "Hidden GC", "gc.example", "Email estimating"]) expect(freeHtml).not.toContain(secret);
    expect(freeHtml).toContain(t.lead.gcLocked);
    const proHtml = renderToStaticMarkup(<LeadList leads={leadsForViewer(withPro, true)} t={t} lang="en" tradeNames={names} />);
    for (const secret of ["Secret Builders", "Hidden GC", "https://gc.example/prequal", "Email estimating"]) expect(proHtml).toContain(secret);
  });
});

describe("lead alerts", () => {
  const base: Omit<Lead, "key" | "kind" | "seen"> = {
    title: "T", summary: null, city: "Toronto", province: "Ontario", area: "city", date: null, deadline: null, valueCad: null,
    trades: ["painting"], tradeMatch: "typical", href: "/x", status: null, hasContractor: false, hasBidRoute: false, score: 1, pro: null,
  };
  const L = (key: string, kind: Lead["kind"], seen: string | null): Lead => ({ ...base, key, kind, seen });

  it("sends a lead once, only new ones, never bids, at most the cap", () => {
    const leads = [
      L("mp:new", "project", "2026-10-14"),
      L("mp:sent", "permit", "2026-10-14"),
      L("mp:old", "project", "2026-09-01"),
      L("rfp:bid", "bid", null),
      L("rfp:award", "award", "2026-10-01"), // award notices get extra slack
      L("mp:new", "project", "2026-10-14"), // duplicate key
    ];
    const picks = pickLeadAlerts(leads, { alreadySent: new Set(["mp:sent"]), today: TODAY, cadence: "daily" });
    expect(picks.map((l) => l.key)).toEqual(["mp:new", "rfp:award"]);
    expect(pickLeadAlerts(leads, { alreadySent: new Set(["mp:sent", "mp:new", "rfp:award"]), today: TODAY, cadence: "daily" })).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => L(`mp:${i}`, "project", "2026-10-14"));
    expect(pickLeadAlerts(many, { alreadySent: new Set(), today: TODAY, cadence: "weekly", max: 10 })).toHaveLength(10);
  });

  it("respects the opportunity-email setting and cadence", () => {
    expect(leadCadence(undefined)).toBe("daily");
    expect(leadCadence({ new_rfps: "weekly", channel_email: true })).toBe("weekly");
    expect(leadCadence({ new_rfps: "off" })).toBeNull();
    expect(leadCadence({ new_rfps: "daily", channel_email: false })).toBeNull();
    const now = new Date("2026-10-15T14:20:00Z");
    expect(isDue("daily", "2026-10-14T14:20:00Z", now)).toBe(true);
    expect(isDue("daily", "2026-10-15T08:00:00Z", now)).toBe(false);
    expect(isDue("weekly", "2026-10-12T14:20:00Z", now)).toBe(false);
    expect(isDue("weekly", "2026-10-08T14:20:00Z", now)).toBe(true);
    expect(leadAlertsEnabled(undefined)).toBe(false);
    expect(leadAlertsEnabled("1")).toBe(true);
  });

  it("escapes what it puts in the email", () => {
    const html = leadAlertHtml([{ ...L("mp:x", "project", TODAY), title: "<b>Tower</b>", pro: { contractor: "A & B <Ltd>", buyer: null, bidListUrl: null, bidRoute: null, sourceUrl: null } }], "https://pmrfp.com", String);
    expect(html).toContain("&lt;b&gt;Tower&lt;/b&gt;");
    expect(html).toContain("A &amp; B &lt;Ltd&gt;");
  });
});

describe("Trade Pro trial entitlement", () => {
  const start = new Date("2026-10-01T12:00:00Z");
  const row = { startedAt: start.toISOString(), endsAt: trialEndsAt(start).toISOString() };

  it("runs 14 days, counts days left, then ends", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(trialState(row, new Date("2026-10-01T13:00:00Z"))).toMatchObject({ status: "active", daysLeft: 14 });
    expect(trialState(row, new Date("2026-10-15T11:00:00Z"))).toMatchObject({ status: "active", daysLeft: 1 });
    expect(trialState(row, new Date("2026-10-15T12:00:01Z"))).toMatchObject({ status: "expired", daysLeft: 0 });
    expect(trialState(null)).toBe(NO_TRIAL);
  });

  it("an active trial is Trade Pro; an expired one is not", () => {
    expect(isProEntitled({ paid: false, trial: trialState(row, new Date("2026-10-05T00:00:00Z")) })).toBe(true);
    expect(isProEntitled({ paid: false, trial: trialState(row, new Date("2026-11-01T00:00:00Z")) })).toBe(false);
    expect(isProEntitled({ paid: true, trial: NO_TRIAL })).toBe(true);
  });

  it("one trial per company, trade companies only, not while paying", () => {
    const ok = { signedIn: true, organizationType: "trade_company", paid: false, existing: null };
    expect(trialRefusal(ok)).toBeNull();
    expect(trialRefusal({ ...ok, existing: row })).toBe("used");
    expect(trialRefusal({ ...ok, paid: true })).toBe("paid");
    expect(trialRefusal({ ...ok, organizationType: "property_manager" })).toBe("role");
    expect(trialRefusal({ ...ok, signedIn: false })).toBe("signin");
    expect(isDuplicateTrialError({ code: "23505" })).toBe(true);
    expect(isMissingTableError({ code: "42P01", message: 'relation "trade_trials" does not exist' })).toBe(true);
  });

  /** In-memory trade_trials with a primary key on organization_id. */
  function fakeDb(opts: { missing?: boolean } = {}) {
    const rows = new Map<string, Record<string, unknown>>();
    const missingErr = { code: "42P01", message: 'relation "public.trade_trials" does not exist' };
    const db = {
      from: () => ({
        select: () => ({
          eq: (_c: string, v: string) => ({
            maybeSingle: async () => (opts.missing ? { data: null, error: missingErr } : { data: rows.get(v) ?? null, error: null }),
          }),
        }),
        insert: async (r: Record<string, unknown>) => {
          if (opts.missing) return { error: missingErr };
          const id = String(r.organization_id);
          if (rows.has(id)) return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          rows.set(id, r);
          return { error: null };
        },
      }),
    };
    return { db: db as unknown as SupabaseClient, rows };
  }

  const session = (o: Partial<SessionContext> = {}): SessionContext =>
    ({
      userId: "u1",
      profile: { id: "u1" },
      organization: { id: "org1", organization_type: "trade_company", status: "active" } as Organization,
      hasTradeAccess: false,
      paid: false,
      trial: NO_TRIAL,
      ...o,
    }) as SessionContext;

  it("starts once; a second start (or a racing double click) is refused", async () => {
    const { db, rows } = fakeDb();
    const first = await startOrgTrial(session(), "dashboard", start, db);
    expect(first.ok).toBe(true);
    expect(rows.get("org1")).toMatchObject({ organization_id: "org1", started_by: "u1", source: "dashboard", ends_at: row.endsAt });
    expect(await startOrgTrial(session(), "pricing", start, db)).toEqual({ ok: false, reason: "used" });
    // Even when the pre-check misses it, the primary key refuses a duplicate.
    const racing = fakeDb();
    racing.rows.set("org1", {});
    const insertOnly = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert: (racing.db as unknown as { from: () => { insert: (r: unknown) => Promise<unknown> } }).from().insert }) };
    expect(await startOrgTrial(session(), "leads", start, insertOnly as unknown as SupabaseClient)).toEqual({ ok: false, reason: "used" });
  });

  it("refuses paying companies and fails closed without the table", async () => {
    expect(await startOrgTrial(session({ paid: true, hasTradeAccess: true }), "dashboard", start, fakeDb().db)).toEqual({ ok: false, reason: "paid" });
    expect(await startOrgTrial(session(), "dashboard", start, fakeDb({ missing: true }).db)).toEqual({ ok: false, reason: "unavailable" });
    expect(await startOrgTrial(null, "dashboard", start, fakeDb().db)).toEqual({ ok: false, reason: "signin" });
  });

  /** A cookie-client stand-in for loadSessionContext: one row per table. */
  function sessionClient(tables: Record<string, { data: unknown; error?: { code?: string; message: string } | null }>) {
    return {
      auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@b.c" } } }) },
      from: (table: string) => {
        const res = tables[table] ?? { data: null };
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.maybeSingle = async () => ({ data: res.data, error: res.error ?? null });
        return b;
      },
    } as unknown as SupabaseClient;
  }

  const base = {
    users_profile: { data: { id: "u1", primary_role: "trade", status: "active" } },
    organization_members: { data: { organization_id: "org1" } },
    organizations: { data: { id: "org1", organization_type: "trade_company", status: "active" } },
    subscriptions: { data: null },
  };

  it("the central check (computeTradeAccess) treats an active trial as Trade Pro", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const s = await loadSessionContext(sessionClient({ ...base, trade_trials: { data: { started_at: new Date().toISOString(), ends_at: future } } }));
    expect(s).toMatchObject({ hasTradeAccess: true, paid: false });
    expect(s?.trial?.status).toBe("active");
  });

  it("an expired trial or a missing trials table falls back to free", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const expired = await loadSessionContext(sessionClient({ ...base, trade_trials: { data: { started_at: past, ends_at: past } } }));
    expect(expired).toMatchObject({ hasTradeAccess: false, paid: false });
    expect(expired?.trial?.status).toBe("expired");
    const missing = await loadSessionContext(
      sessionClient({ ...base, trade_trials: { data: null, error: { code: "42P01", message: "relation does not exist" } } }),
    );
    expect(missing).toMatchObject({ hasTradeAccess: false, trial: NO_TRIAL });
    const payingWithOldTrial = await loadSessionContext(
      sessionClient({ ...base, subscriptions: { data: { status: "active", tier: "pro" } }, trade_trials: { data: { started_at: past, ends_at: past } } }),
    );
    expect(payingWithOldTrial).toMatchObject({ hasTradeAccess: true, paid: true });
  });
});
