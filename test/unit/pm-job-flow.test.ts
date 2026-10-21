import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * The PM job flow (PR feat/pm-job-flow): a PM posts a job → matching trades
 * are emailed the same day → trades respond (free 3/month, Pro unlimited) →
 * the PM is told → the PM shortlists, declines or picks → everyone hears the
 * outcome, and contacts open only on pick or "share my contact".
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  session: null as null | Record<string, unknown>,
  sent: [] as { fn: string; to: string; p: Record<string, unknown> }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/email/send", () => {
  const spy = (fn: string) => async (to: string, p: Record<string, unknown> = {}) => void h.sent.push({ fn, to, p: typeof p === "object" ? p : { title: p } });
  return {
    sendPmNewInterest: spy("pmNewInterest"),
    sendInterestConfirmation: async (to: string, title: string, p: Record<string, unknown> = {}) => void h.sent.push({ fn: "confirmation", to, p: { title, ...p } }),
    sendAdminNewInterest: async (p: Record<string, unknown>) => void h.sent.push({ fn: "adminNewInterest", to: "admin", p }),
    sendPmJobAlert: spy("jobAlert"),
    sendTradeDeclined: spy("declined"),
    sendTradePicked: spy("picked"),
    sendTradeNotSelected: spy("notSelected"),
    sendTradeContactShared: spy("contactShared"),
  };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => h.db }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/access/access", () => ({ getSession: async () => h.session, isAdminRole: (r: string) => r === "admin" || r === "super_admin" }));
vi.mock("@/lib/access/request-session", () => ({ getSessionFromRequest: async () => (h.session ? { session: h.session, db: h.db, via: "cookie" } : null) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => null, rateLimitResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/karma/sync", () => ({ karmaSyncAfter: async () => undefined }));
vi.mock("@/lib/analytics", () => ({ EVENT: { RFP_INTEREST_SUBMITTED: "rfp_interest_submitted" }, trackEvent: async () => undefined }));
vi.mock("@/lib/projects/attach", () => ({ validAttachments: async () => [] }));

import {
  FREE_MONTHLY_RESPONSES,
  adminNotificationEmail,
  isFreeLimitError,
  monthStart,
  parseQuoteAmount,
  pickPlan,
  pmContactCard,
  pmSeesTradeContact,
  respondDecision,
  responseAllowance,
  tradeSeesPmContact,
} from "@/lib/pm-jobs/rules";
import { RegionIndex, jobPlace, regionMatches, tradeArea, type RegionRow } from "@/lib/pm-jobs/regions";
import { optedOutUsers, pmJobAlertKey, pmJobAlertsEnabled, selectAlertAudience, weeklyUsers, type AlertOrg } from "@/lib/pm-jobs/alerts";
import { runPmJobAlerts } from "@/lib/pm-jobs/server";
import { declineResponse, loadJobForDecision, ownsJob, pickResponse, shareContactWith, toggleShortlist } from "@/lib/pm-jobs/decisions";
import { confirmationEmail, jobAlertEmail, newInterestEmail, pickedEmail, publishedEmail, rejectedEmail } from "@/lib/pm-jobs/email-copy";
import { POST as interestPost } from "@/app/api/rfp-interest/route";

// ── Fixtures ────────────────────────────────────────────────────────

const REGIONS: RegionRow[] = [
  { id: "ca", name: "Canada", slug: "canada", parent_id: null, province: null, country: "Canada" },
  { id: "on", name: "Ontario", slug: "ontario", parent_id: "ca", province: "Ontario", country: "Canada" },
  { id: "gta", name: "Greater Toronto Area", slug: "greater-toronto-area", parent_id: "on", province: "Ontario", country: "Canada" },
  { id: "to", name: "Toronto", slug: "toronto", parent_id: "gta", province: "Ontario", country: "Canada" },
  { id: "mi", name: "Mississauga", slug: "mississauga", parent_id: "gta", province: "Ontario", country: "Canada" },
  { id: "ot", name: "Ottawa", slug: "ottawa", parent_id: "on", province: "Ontario", country: "Canada" },
  { id: "qc", name: "Quebec", slug: "quebec", parent_id: "ca", province: "Quebec", country: "Canada" },
  // Filed straight under the country, but inside Quebec by its province.
  { id: "mtl", name: "Montreal", slug: "montreal", parent_id: "ca", province: "Quebec", country: "Canada" },
  { id: "us", name: "United States", slug: "united-states", parent_id: null, province: null, country: "USA" },
  { id: "ny", name: "New York", slug: "us-new-york", parent_id: "us", province: null, country: "USA" },
  { id: "tx", name: "Texas", slug: "us-texas", parent_id: "us", province: null, country: "USA" },
];
const idx = new RegionIndex(REGIONS);
const place = (job: { region_id: string | null; city?: string | null; province?: string | null }, country: "CA" | "US" = "CA") => jobPlace(job, idx, country);

const NOW = new Date().toISOString();
const PM = "user-pm";
const PM_ORG = "org-pm";

function baseDb(extra: Record<string, Record<string, unknown>[]> = {}): FakeDb {
  return fakeDb(
    {
      rfp_posts: [
        {
          id: "job-1",
          title: "Roof repair <3-storey condo>",
          slug: "roof-repair-ab12",
          summary: "Patch two leaks over units 301 and 302.",
          status: "published",
          source_type: "property_manager_direct",
          region_id: "on",
          city: "Toronto",
          province: "Ontario",
          deadline: "2099-01-01",
          posted_by_user_id: PM,
          posted_by_organization_id: PM_ORG,
          contact_name: null,
          contact_email: null,
          contact_phone: "416-555-0100",
          poster_lang: "fr",
          published_at: NOW,
          rfp_categories: [{ category_id: "cat-roof", trade_categories: { name: "Roofing" } }],
        },
        {
          id: "tender-1",
          title: "City tender",
          slug: "city-tender",
          status: "published",
          source_type: "public_source",
          posted_by_user_id: null,
          posted_by_organization_id: null,
          rfp_categories: [],
        },
      ],
      regions: REGIONS as unknown as Record<string, unknown>[],
      organizations: [
        { id: PM_ORG, name: "Maple Property Group", organization_type: "property_manager", status: "active", profile_status: "approved", phone: "416-555-0199", email: "office@maple.example" },
        { id: "org-free", name: "Northline Roofing", organization_type: "trade_company", status: "active", profile_status: "approved", is_demo: false, city: "Toronto", province: "Ontario", country: "Canada", email: "jobs@northline.example", phone: "416-555-0123", public_contact_visibility: "request_intro" },
        { id: "org-pro", name: "Apex Roofing", organization_type: "trade_company", status: "active", profile_status: "approved", is_demo: false, city: "Mississauga", province: "Ontario", country: "Canada", email: "apex@example.com" },
        { id: "org-pending", name: "Pending Roofing", organization_type: "trade_company", status: "active", profile_status: "pending_review", is_demo: false, city: "Toronto", province: "Ontario" },
        { id: "org-ny", name: "Empire Roofing", organization_type: "trade_company", status: "active", profile_status: "approved", is_demo: false, city: "Buffalo", province: "New York", country: "United States" },
        { id: "org-demo", name: "Demo Roofing", organization_type: "trade_company", status: "active", profile_status: "approved", is_demo: true, city: "Toronto", province: "Ontario" },
        { id: "org-hvac", name: "Cool HVAC", organization_type: "trade_company", status: "active", profile_status: "approved", is_demo: false, city: "Toronto", province: "Ontario" },
      ],
      organization_categories: [
        { organization_id: "org-free", category_id: "cat-roof" },
        { organization_id: "org-pro", category_id: "cat-roof" },
        { organization_id: "org-pending", category_id: "cat-roof" },
        { organization_id: "org-ny", category_id: "cat-roof" },
        { organization_id: "org-demo", category_id: "cat-roof" },
        { organization_id: "org-hvac", category_id: "cat-hvac" },
      ],
      organization_regions: [
        // Listed only Toronto: still gets a job filed under Ontario.
        { organization_id: "org-free", region_id: "to" },
        { organization_id: "org-pro", region_id: "gta" },
        { organization_id: "org-ny", region_id: "ny" },
        { organization_id: "org-pending", region_id: "to" },
        { organization_id: "org-demo", region_id: "to" },
        { organization_id: "org-hvac", region_id: "to" },
      ],
      organization_members: [
        { organization_id: "org-free", user_id: "u-free" },
        { organization_id: "org-free", user_id: "u-free-optout" },
        { organization_id: "org-pro", user_id: "u-pro" },
        { organization_id: "org-pending", user_id: "u-pending" },
        { organization_id: "org-ny", user_id: "u-ny" },
        { organization_id: "org-demo", user_id: "u-demo" },
        { organization_id: "org-hvac", user_id: "u-hvac" },
      ],
      users_profile: [
        { id: PM, email: "pm@maple.example", full_name: "Dana Property", phone: null, status: "active" },
        { id: "u-free", email: "owner@northline.example", full_name: "Sam North", status: "active" },
        { id: "u-free-optout", email: "office@northline.example", status: "active" },
        { id: "u-pro", email: "owner@apex.example", status: "active" },
        { id: "u-pending", email: "p@pending.example", status: "active" },
        { id: "u-ny", email: "ny@empire.example", status: "active" },
        { id: "u-demo", email: "demo@demo.example", status: "active" },
        { id: "u-hvac", email: "cool@hvac.example", status: "active" },
      ],
      notification_preferences: [{ user_id: "u-free-optout", new_rfps: "off", channel_email: true }],
      subscriptions: [{ organization_id: "org-pro", status: "active", tier: "pro" }],
      trade_trials: [],
      signup_attribution: [{ user_id: "u-pro", lang: "es" }],
      lead_alert_log: [],
      notifications: [],
      rfp_interests: [],
      ...extra,
    },
    {
      unique: {
        lead_alert_log: (e, r) => e.user_id === r.user_id && e.lead_key === r.lead_key,
        rfp_interests: (e, r) => e.rfp_id === r.rfp_id && e.trade_organization_id === r.trade_organization_id,
      },
      defaults: { rfp_interests: { status: "submitted", contact_revealed: false, pm_contact_shared: false, created_at: NOW } },
    },
  );
}

beforeEach(() => {
  h.sent = [];
  h.session = null;
  h.db = baseDb();
  delete process.env.PM_JOB_ALERTS_ENABLED;
  process.env.BUSINESS_MAILING_ADDRESS = "123 Example St, Toronto ON M5V 1A1";
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
});

// ── Rules ───────────────────────────────────────────────────────────

describe("free monthly allowance", () => {
  it("resets on the 1st, Toronto time (also across the November DST change)", () => {
    expect(monthStart(new Date("2026-11-01T03:00:00Z"))).toBe("2026-10-01T04:00:00.000Z"); // still Oct 31 in Toronto
    expect(monthStart(new Date("2026-11-01T05:00:00Z"))).toBe("2026-11-01T04:00:00.000Z"); // midnight EDT on Nov 1
    expect(monthStart(new Date("2026-12-15T12:00:00Z"))).toBe("2026-12-01T05:00:00.000Z"); // EST
  });

  it("free gets 3 a month; Pro and trials are unlimited", () => {
    expect(FREE_MONTHLY_RESPONSES).toBe(3);
    expect(responseAllowance({ pro: false, usedThisMonth: 1 })).toMatchObject({ unlimited: false, left: 2, limit: 3 });
    expect(responseAllowance({ pro: false, usedThisMonth: 5 }).left).toBe(0);
    expect(responseAllowance({ pro: true, usedThisMonth: 40 })).toMatchObject({ unlimited: true, left: Infinity });
  });

  const org = { id: "org-free", organization_type: "trade_company", status: "active", profile_status: "approved" };
  const job = { status: "published", source_type: "property_manager_direct", posted_by_user_id: PM, posted_by_organization_id: PM_ORG };
  const decide = (over: Partial<Parameters<typeof respondDecision>[0]> = {}) =>
    respondDecision({ signedIn: true, org, pro: false, rfp: job, userId: "u-free", usedThisMonth: 0, ...over });

  it("lets any approved trade respond to a PM job while free responses are left", () => {
    expect(decide()).toEqual({ refusal: null, free: true });
    expect(decide({ usedThisMonth: 2 })).toEqual({ refusal: null, free: true });
    expect(decide({ usedThisMonth: 3 }).refusal).toBe("limit");
    expect(decide({ org: { ...org, organization_type: "supplier" } }).refusal).toBeNull();
    expect(decide({ rfp: { ...job, source_type: "gc_package" } })).toEqual({ refusal: null, free: true });
  });

  it("Pro is unlimited and keeps responding to other private listings", () => {
    expect(decide({ pro: true, usedThisMonth: 99 })).toEqual({ refusal: null, free: false });
    expect(decide({ pro: true, rfp: { ...job, source_type: "admin_seeded", posted_by_user_id: null } })).toEqual({ refusal: null, free: false });
    expect(decide({ rfp: { ...job, source_type: "admin_seeded", posted_by_user_id: null } }).refusal).toBe("pro_required");
  });

  it("refuses the cases that never qualify", () => {
    expect(decide({ signedIn: false }).refusal).toBe("signin");
    expect(decide({ org: null }).refusal).toBe("org");
    expect(decide({ org: { ...org, organization_type: "property_manager" } }).refusal).toBe("role");
    expect(decide({ org: { ...org, status: "suspended" } }).refusal).toBe("suspended");
    expect(decide({ org: { ...org, profile_status: "pending_review" } }).refusal).toBe("not_approved");
    expect(decide({ rfp: { ...job, source_type: "public_source" }, pro: true }).refusal).toBe("public_tender");
    expect(decide({ rfp: { ...job, status: "pending_review" } }).refusal).toBe("not_open");
    expect(decide({ rfp: { ...job, posted_by_organization_id: "org-free" } }).refusal).toBe("own_job");
  });

  it("reads the database's own limit error", () => {
    expect(isFreeLimitError({ code: "P0001", message: "free response limit reached", hint: "pmrfp_free_limit" })).toBe(true);
    expect(isFreeLimitError({ code: "23505", message: "duplicate" })).toBe(false);
  });

  it("parses typed prices, English and French", () => {
    expect(parseQuoteAmount("12500")).toBe(12500);
    expect(parseQuoteAmount("$12,500")).toBe(12500);
    expect(parseQuoteAmount("12,500.50")).toBe(12500.5);
    expect(parseQuoteAmount("12 500,50 $")).toBe(12500.5);
    expect(parseQuoteAmount("about 12k")).toBeNull();
    expect(parseQuoteAmount(-5)).toBeNull();
    expect(parseQuoteAmount("")).toBeNull();
  });
});

describe("admin notification email", () => {
  it("falls back to info@pmrfp.com when ADMIN_NOTIFICATION_EMAIL is unset or blank", () => {
    expect(adminNotificationEmail(undefined)).toBe("info@pmrfp.com");
    expect(adminNotificationEmail("   ")).toBe("info@pmrfp.com");
    expect(adminNotificationEmail(" ops@pmrfp.com ")).toBe("ops@pmrfp.com");
  });
});

// ── Regions ─────────────────────────────────────────────────────────

describe("region matching, both ways", () => {
  it("down: a trade covering Ontario gets a Toronto job", () => {
    expect(regionMatches(place({ region_id: "to" }), ["on"], idx)).toBe(true);
    expect(regionMatches(place({ region_id: "to" }), ["ca"], idx)).toBe(true);
  });

  it("up: a job filed under Ontario reaches a trade that only listed Toronto", () => {
    expect(regionMatches(place({ region_id: "on" }), ["to"], idx)).toBe(true);
    expect(regionMatches(place({ region_id: "gta" }), ["mi"], idx)).toBe(true);
  });

  it("uses the job's city: Ontario + Ottawa reaches Ottawa and Ontario trades, not Toronto-only ones", () => {
    const p = place({ region_id: "on", city: "Ottawa" });
    expect(p).toBe("ot");
    expect(regionMatches(p, ["ot"], idx)).toBe(true);
    expect(regionMatches(p, ["on"], idx)).toBe(true);
    expect(regionMatches(p, ["to"], idx)).toBe(false);
  });

  it("city within a province via the region data (Montreal sits under Canada, province Quebec)", () => {
    expect(regionMatches(place({ region_id: "qc" }), ["mtl"], idx)).toBe(true);
    expect(regionMatches(place({ region_id: "mtl" }), ["qc"], idx)).toBe(true);
    expect(regionMatches(place({ region_id: "mtl" }), ["on"], idx)).toBe(false);
  });

  it("a job filed only under the whole country never fans out to every trade", () => {
    expect(regionMatches(place({ region_id: "ca" }), ["to"], idx)).toBe(false);
    expect(regionMatches(place({ region_id: "ca" }), ["ca"], idx)).toBe(true);
    // …but its province and city still place it.
    expect(place({ region_id: "ca", province: "Ontario", city: "Toronto" })).toBe("to");
    expect(regionMatches(place({ region_id: "ca", province: "Ontario" }), ["to"], idx)).toBe(true);
  });

  it("never crosses the border", () => {
    expect(regionMatches(place({ region_id: "to" }), ["us"], idx)).toBe(false);
    expect(regionMatches(place({ region_id: "on" }), ["ny"], idx)).toBe(false);
    expect(regionMatches(place({ region_id: "ny" }, "US"), ["us"], idx)).toBe(true);
    expect(regionMatches(place({ region_id: "us" }, "US"), ["tx"], idx)).toBe(false);
  });

  it("places a trade without service regions by its own city, then province", () => {
    expect(tradeArea({ city: "Mississauga", province: "Ontario" }, [], idx, "CA")).toEqual(["mi"]);
    expect(tradeArea({ city: "Barrie", province: "Ontario" }, [], idx, "CA")).toEqual(["on"]);
    expect(tradeArea({ city: null, province: null }, [], idx, "CA")).toEqual([]);
    expect(tradeArea({ city: "Toronto" }, ["gta"], idx, "CA")).toEqual(["gta"]);
  });
});

// ── Alert recipients ────────────────────────────────────────────────

describe("PM job alert recipients", () => {
  const orgs: AlertOrg[] = [
    { id: "a", name: "A Roofing", organization_type: "trade_company", status: "active", profile_status: "approved", city: "Toronto", province: "Ontario", countries: new Set(["CA"]) },
    { id: "b", name: "B Supply", organization_type: "supplier", status: "active", profile_status: "approved", city: "Mississauga", province: "Ontario", countries: new Set(["CA"]) },
    { id: "pending", name: "Pending", organization_type: "trade_company", status: "active", profile_status: "pending_review", city: "Toronto", province: "Ontario", countries: new Set(["CA"]) },
    { id: "suspended", name: "Suspended", organization_type: "trade_company", status: "suspended", profile_status: "approved", city: "Toronto", province: "Ontario", countries: new Set(["CA"]) },
    { id: "us", name: "US Roofing", organization_type: "trade_company", status: "active", profile_status: "approved", city: "Buffalo", province: "New York", countries: new Set(["US"]) },
    { id: "own", name: "Poster's company", organization_type: "trade_company", status: "active", profile_status: "approved", city: "Toronto", province: "Ontario", countries: new Set(["CA"]) },
  ];
  const input = {
    job: { id: "j", region_id: "on", city: null, province: "Ontario", country: "CA" as const, categoryIds: ["roof"], posted_by_user_id: "poster", posted_by_organization_id: "own" },
    regions: REGIONS,
    orgs,
    catsByOrg: new Map(orgs.map((o) => [o.id, new Set(["roof"])])),
    regionsByOrg: new Map<string, string[]>([["a", ["to"]], ["b", ["mi"]], ["us", ["ny"]], ["own", ["to"]], ["pending", ["to"]], ["suspended", ["to"]]]),
    usersByOrg: new Map<string, string[]>([["a", ["a1", "a2", "a3", "shared"]], ["b", ["b1", "shared"]], ["pending", ["p1"]], ["suspended", ["s1"]], ["us", ["us1"]], ["own", ["poster"]]]),
    users: new Map<string, { email: string | null; status?: string | null }>([
      ["a1", { email: "a1@x" }], ["a2", { email: "a2@x" }], ["a3", { email: null }], ["shared", { email: "shared@x" }],
      ["b1", { email: "b1@x", status: "suspended" }], ["p1", { email: "p1@x" }], ["s1", { email: "s1@x" }], ["us1", { email: "us1@x" }], ["poster", { email: "poster@x" }],
    ]),
    optedOut: optedOutUsers([{ user_id: "a2", new_rfps: "off" }, { user_id: "zz", channel_email: false }]),
    alreadySent: new Set<string>(),
    proOrgIds: new Set(["b"]),
  };

  it("emails approved, active companies in the trade and area, free and Pro alike, once per person", () => {
    const a = selectAlertAudience(input);
    expect(a.orgs.map((o) => o.id).sort()).toEqual(["a", "b"]);
    expect(a.recipients.map((r) => r.userId).sort()).toEqual(["a1", "shared"]);
    expect(a.skipped).toEqual({ optedOut: 1, weekly: 0, alreadySent: 0, noEmail: 2 });
    expect(a.orgs.find((o) => o.id === "b")?.pro).toBe(true);
  });

  it("respects a weekly email preference (the Monday digest carries the job instead)", () => {
    const a = selectAlertAudience({ ...input, weekly: weeklyUsers([{ user_id: "a1", new_rfps: "weekly" }, { user_id: "x", new_rfps: "daily" }]) });
    expect(a.recipients.map((r) => r.userId)).toEqual(["shared"]);
    expect(a.skipped.weekly).toBe(1);
  });

  it("skips anyone already sent this job (lead_alert_log)", () => {
    const a = selectAlertAudience({ ...input, alreadySent: new Set(["a1"]) });
    expect(a.recipients.map((r) => r.userId)).toEqual(["shared"]);
    expect(a.skipped.alreadySent).toBe(1);
  });

  it("never emails across the border or outside the trade", () => {
    const a = selectAlertAudience({ ...input, catsByOrg: new Map([["a", new Set(["hvac"])], ["us", new Set(["roof"])]]) });
    expect(a.recipients).toEqual([]);
  });

  it("is gated by PM_JOB_ALERTS_ENABLED (default off)", () => {
    expect(pmJobAlertsEnabled(undefined)).toBe(false);
    expect(pmJobAlertsEnabled("0")).toBe(false);
    expect(pmJobAlertsEnabled("1")).toBe(true);
    expect(pmJobAlertsEnabled("true")).toBe(true);
    expect(pmJobAlertKey("abc")).toBe("pmjob:abc");
  });
});

describe("runPmJobAlerts (same-day job email)", () => {
  it("with the flag off: reports who would be emailed, sends and records nothing", async () => {
    const res = await runPmJobAlerts(h.db as never, "job-1");
    expect(res.state).toBe("off");
    // Northline (listed Toronto, job filed under Ontario) and Apex (GTA): free and Pro.
    expect(res.orgs.map((o) => o.name).sort()).toEqual(["Apex Roofing", "Northline Roofing"]);
    expect(res.wouldEmail).toBe(2); // u-free and u-pro; u-free-optout turned these emails off
    expect(h.sent.filter((s) => s.fn === "jobAlert")).toEqual([]);
    expect(h.db.tables.lead_alert_log).toEqual([]);
  });

  it("with the flag on: emails each person once, with the CASL footer pieces, logs and notifies; a re-run sends nothing", async () => {
    const first = await runPmJobAlerts(h.db as never, "job-1", { enabled: true });
    expect(first).toMatchObject({ state: "sent", sent: 2 });
    const alerts = h.sent.filter((s) => s.fn === "jobAlert");
    expect(alerts.map((a) => a.to).sort()).toEqual(["owner@apex.example", "owner@northline.example"]);
    for (const a of alerts) {
      expect(String(a.p.unsubscribeUrl)).toContain("/api/email/unsubscribe?u=");
      expect(a.p.mailingAddress).toBe("123 Example St, Toronto ON M5V 1A1");
    }
    // Language per recipient, Pro line for the Pro company.
    expect(alerts.find((a) => a.to === "owner@apex.example")?.p).toMatchObject({ lang: "es", pro: true });
    expect(alerts.find((a) => a.to === "owner@northline.example")?.p).toMatchObject({ lang: "en", pro: false });
    expect(h.db.tables.lead_alert_log.map((r) => r.lead_key)).toEqual(["pmjob:job-1", "pmjob:job-1"]);
    // In-app, with the same type and link the daily Pro digest dedupes on.
    expect(h.db.tables.notifications.filter((n) => n.type === "rfp_alert" && n.link_url === "/rfps/roof-repair-ab12")).toHaveLength(2);

    h.sent = [];
    const again = await runPmJobAlerts(h.db as never, "job-1", { enabled: true });
    expect(again).toMatchObject({ state: "sent", sent: 0, wouldEmail: 0 });
    expect(h.sent).toEqual([]);
  });

  it("refuses to send without a mailing address (CASL), and never for public tenders", async () => {
    delete process.env.BUSINESS_MAILING_ADDRESS;
    expect(await runPmJobAlerts(h.db as never, "job-1", { enabled: true })).toMatchObject({ state: "blocked", reason: "mailing_address" });
    expect(await runPmJobAlerts(h.db as never, "tender-1", { enabled: true })).toMatchObject({ state: "blocked", reason: "not_pm_job" });
    expect(h.sent).toEqual([]);
  });

  it("dry run (admin preview) sends nothing even with the flag on", async () => {
    const res = await runPmJobAlerts(h.db as never, "job-1", { dry: true, enabled: true });
    expect(res).toMatchObject({ state: "dry", wouldEmail: 2 });
    expect(h.sent).toEqual([]);
  });
});

// ── Responding ──────────────────────────────────────────────────────

function tradeSession(over: { org?: string; pro?: boolean; status?: string; profile?: string } = {}) {
  const org = over.org ?? "org-free";
  const orgRow = h.db.tables.organizations.find((o) => o.id === org)!;
  return {
    userId: org === "org-pro" ? "u-pro" : "u-free",
    profile: { email: org === "org-pro" ? "owner@apex.example" : "owner@northline.example", primary_role: "trade" },
    organization: { ...orgRow, status: over.status ?? "active", profile_status: over.profile ?? orgRow.profile_status },
    hasTradeAccess: over.pro ?? org === "org-pro",
  };
}

const respond = (body: Record<string, unknown> = {}) =>
  interestPost(
    new Request("http://localhost/api/rfp-interest", {
      method: "POST",
      body: JSON.stringify({ rfpId: "job-1", message: "We fix flat roofs every week.", acceptDisclaimer: true, quoteAmount: "4,800", quoteKind: "firm", startDate: "2026-11-03", lang: "en", ...body }),
    }),
  );

describe("responding to a PM job", () => {
  it("a free approved trade responds; the PM is emailed at their account address (looked up server-side) and notified in-app", async () => {
    h.session = tradeSession();
    const res = await respond();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, allowance: { unlimited: false, left: 2, limit: 3 } });
    const row = h.db.tables.rfp_interests[0];
    expect(row).toMatchObject({ rfp_id: "job-1", trade_organization_id: "org-free", used_free_allowance: true, quote_amount: 4800, quote_kind: "firm", start_date: "2026-11-03" });

    const pm = h.sent.find((s) => s.fn === "pmNewInterest");
    expect(pm?.to).toBe("pm@maple.example");
    // The poster posted in French.
    expect(pm?.p).toMatchObject({ vendorName: "Northline Roofing", rfpId: "job-1", lang: "fr" });
    expect(h.db.tables.notifications.find((n) => n.user_id === PM)).toMatchObject({ type: "pm_new_response", link_url: "/pm-dashboard/rfps/job-1/interests" });
    expect(h.sent.find((s) => s.fn === "confirmation")?.p).toMatchObject({ allowance: { unlimited: false, left: 2, limit: 3 } });
  });

  it("the 4th free response in a calendar month is refused (and nobody is emailed); last month's don't count", async () => {
    h.session = tradeSession();
    const lastMonth = new Date(Date.parse(monthStart()) - 86_400_000).toISOString();
    h.db.tables.rfp_interests.push(
      { id: "old", rfp_id: "x0", trade_organization_id: "org-free", used_free_allowance: true, created_at: lastMonth },
      { id: "i1", rfp_id: "x1", trade_organization_id: "org-free", used_free_allowance: true, created_at: NOW },
      { id: "i2", rfp_id: "x2", trade_organization_id: "org-free", used_free_allowance: true, created_at: NOW },
    );
    const third = await respond();
    expect(third.status).toBe(200);
    expect((await third.json()).allowance).toMatchObject({ left: 0 });

    h.db.tables.rfp_posts.push({ ...h.db.tables.rfp_posts[0], id: "job-2", slug: "job-2" });
    h.sent = [];
    const fourth = await respond({ rfpId: "job-2" });
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toMatchObject({ reason: "limit" });
    expect(h.sent).toEqual([]);
  });

  it("Trade Pro is unlimited and doesn't use the allowance", async () => {
    h.session = tradeSession({ org: "org-pro" });
    for (let i = 0; i < 5; i++) h.db.tables.rfp_interests.push({ id: `p${i}`, rfp_id: `y${i}`, trade_organization_id: "org-pro", used_free_allowance: false, created_at: NOW });
    const res = await respond();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ allowance: { unlimited: true } });
    expect(h.db.tables.rfp_interests.at(-1)).toMatchObject({ trade_organization_id: "org-pro", used_free_allowance: false });
  });

  it("a free account still can't respond to a public tender or a non-PM listing, or while its profile waits for approval", async () => {
    h.session = tradeSession();
    expect((await respond({ rfpId: "tender-1" })).status).toBe(403);
    h.session = tradeSession({ profile: "pending_review" });
    const pending = await respond();
    expect(pending.status).toBe(403);
    expect(await pending.json()).toMatchObject({ reason: "not_approved" });
    expect(h.db.tables.rfp_interests).toEqual([]);
  });

  it("only emails the PM once the row really exists: a duplicate response sends nothing", async () => {
    h.session = tradeSession();
    expect((await respond()).status).toBe(200);
    h.sent = [];
    const dup = await respond();
    expect(dup.status).toBe(409);
    expect(h.sent).toEqual([]);
  });

  it("falls back to the listing's contact email when the poster has no account email", async () => {
    h.db.tables.users_profile.find((u) => u.id === PM)!.email = null;
    h.db.tables.rfp_posts[0].contact_email = "bids@maple.example";
    h.session = tradeSession();
    await respond();
    expect(h.sent.find((s) => s.fn === "pmNewInterest")?.to).toBe("bids@maple.example");
  });
});

// ── Bid handling ────────────────────────────────────────────────────

function withResponses() {
  h.db.tables.rfp_interests.push(
    { id: "r-free", rfp_id: "job-1", trade_organization_id: "org-free", submitted_by_user_id: "u-free", status: "submitted", lang: "en", pm_contact_shared: false, outcome_notified_at: null, created_at: NOW },
    { id: "r-pro", rfp_id: "job-1", trade_organization_id: "org-pro", submitted_by_user_id: "u-pro", status: "shortlisted", lang: "es", pm_contact_shared: false, outcome_notified_at: null, created_at: NOW },
    { id: "r-declined", rfp_id: "job-1", trade_organization_id: "org-hvac", submitted_by_user_id: "u-hvac", status: "declined", lang: "en", outcome_notified_at: NOW, created_at: NOW },
  );
}

describe("the PM's decisions", () => {
  it("only the poster (or their company, or an admin) decides", () => {
    const job = { posted_by_user_id: PM, posted_by_organization_id: PM_ORG };
    expect(ownsJob(job, { userId: PM, organizationId: null, admin: false })).toBe(true);
    expect(ownsJob(job, { userId: "colleague", organizationId: PM_ORG, admin: false })).toBe(true);
    expect(ownsJob(job, { userId: "u-free", organizationId: "org-free", admin: false })).toBe(false);
    expect(ownsJob(job, { userId: "staff", organizationId: null, admin: true })).toBe(true);
  });

  it("pick: awards the job, sends the picked trade the PM's contact, thanks the others once, leaves the declined one alone", async () => {
    withResponses();
    const job = (await loadJobForDecision(h.db as never, "job-1"))!;
    expect(await pickResponse(h.db as never, job, "r-free")).toEqual({ ok: true });

    const rows = Object.fromEntries(h.db.tables.rfp_interests.map((r) => [r.id, r]));
    expect(rows["r-free"]).toMatchObject({ status: "picked", contact_revealed: true, pm_contact_shared: true });
    expect(rows["r-pro"].status).toBe("not_selected");
    expect(rows["r-declined"].status).toBe("declined");
    expect(h.db.tables.rfp_posts[0].status).toBe("awarded");

    const picked = h.sent.find((s) => s.fn === "picked")!;
    expect(picked.to).toBe("owner@northline.example");
    expect(picked.p.contact).toEqual({ name: "Dana Property", company: "Maple Property Group", email: "pm@maple.example", phone: "416-555-0100" });
    const thanks = h.sent.filter((s) => s.fn === "notSelected");
    expect(thanks.map((s) => s.to)).toEqual(["owner@apex.example"]);
    expect(thanks[0].p.lang).toBe("es");
    expect(h.sent.some((s) => s.to === "cool@hvac.example")).toBe(false);
    expect(h.db.tables.notifications.map((n) => n.type).sort()).toEqual(["response_not_selected", "response_picked"]);

    // A second pick is refused.
    h.sent = [];
    expect(await pickResponse(h.db as never, { ...job, status: "awarded" }, "r-pro")).toEqual({ ok: false, error: "closed" });
    expect(h.sent).toEqual([]);
  });

  it("decline: optional polite note to the trade, no contact shared", async () => {
    withResponses();
    const job = (await loadJobForDecision(h.db as never, "job-1"))!;
    expect(await declineResponse(h.db as never, job, "r-pro", "We went with a lower price this time.")).toEqual({ ok: true });
    expect(h.db.tables.rfp_interests.find((r) => r.id === "r-pro")).toMatchObject({ status: "declined", decision_note: "We went with a lower price this time." });
    const mail = h.sent.find((s) => s.fn === "declined")!;
    expect(mail).toMatchObject({ to: "owner@apex.example", p: { note: "We went with a lower price this time.", lang: "es" } });
    expect(JSON.stringify(mail.p)).not.toContain("pm@maple.example");
    // Already decided: can't decline twice.
    expect(await declineResponse(h.db as never, job, "r-pro", null)).toEqual({ ok: false, error: "closed" });
  });

  it("share my contact: once, by email and in-app; shortlist toggles without emailing", async () => {
    withResponses();
    const job = (await loadJobForDecision(h.db as never, "job-1"))!;
    expect(await shareContactWith(h.db as never, job, "r-free")).toEqual({ ok: true });
    expect(await shareContactWith(h.db as never, job, "r-free")).toEqual({ ok: true });
    expect(h.sent.filter((s) => s.fn === "contactShared")).toHaveLength(1);
    expect(h.db.tables.rfp_interests.find((r) => r.id === "r-free")?.pm_contact_shared).toBe(true);

    h.sent = [];
    expect(await toggleShortlist(h.db as never, job, "r-free")).toEqual({ ok: true });
    expect(h.db.tables.rfp_interests.find((r) => r.id === "r-free")?.status).toBe("shortlisted");
    expect(await toggleShortlist(h.db as never, job, "r-free")).toEqual({ ok: true });
    expect(h.db.tables.rfp_interests.find((r) => r.id === "r-free")?.status).toBe("viewed");
    expect(h.sent).toEqual([]);
  });

  it("pick plan: picked + every open response not selected, only the untold ones get a note", () => {
    const plan = pickPlan(
      [
        { id: "a", status: "submitted" },
        { id: "b", status: "shortlisted", outcome_notified_at: null },
        { id: "c", status: "declined" },
        { id: "d", status: "viewed", outcome_notified_at: "2026-10-01" },
      ],
      "a",
    );
    expect(plan).toEqual({ picked: "a", notSelected: ["b", "d"], notify: ["b"] });
    expect(pickPlan([{ id: "c", status: "declined" }], "c").picked).toBeNull();
  });
});

describe("contact reveal rules", () => {
  it("the PM sees a trade's email and phone only once picked (or when the trade shows them publicly)", () => {
    expect(pmSeesTradeContact({ status: "submitted", tradeVisibility: "request_intro" })).toBe(false);
    expect(pmSeesTradeContact({ status: "shortlisted", tradeVisibility: "hide_contact" })).toBe(false);
    expect(pmSeesTradeContact({ status: "submitted", tradeVisibility: "show_contact" })).toBe(true);
    expect(pmSeesTradeContact({ status: "picked", tradeVisibility: "hide_contact" })).toBe(true);
  });

  it("the trade sees the PM's contact only on pick or an explicit share", () => {
    expect(tradeSeesPmContact({ status: "submitted" })).toBe(false);
    expect(tradeSeesPmContact({ status: "shortlisted" })).toBe(false);
    expect(tradeSeesPmContact({ status: "declined" })).toBe(false);
    expect(tradeSeesPmContact({ status: "submitted", pmContactShared: true })).toBe(true);
    expect(tradeSeesPmContact({ status: "picked" })).toBe(true);
  });

  it("builds the PM's card from the listing first, then the account and company", () => {
    expect(
      pmContactCard({ rfp: { contact_email: " bids@x.com " }, poster: { full_name: "Dana", email: "dana@x.com" }, posterOrg: { name: "Maple", phone: "555" } }),
    ).toEqual({ name: "Dana", company: "Maple", email: "bids@x.com", phone: "555" });
  });
});

// ── Emails ──────────────────────────────────────────────────────────

describe("emails in English, French and Spanish", () => {
  const base = "https://pmrfp.com";
  for (const lang of ["en", "fr", "es"] as const) {
    it(`${lang}: every email has a plain subject, escaped titles and localized links`, () => {
      const title = "Roof <b>repair</b>";
      const emails = [
        newInterestEmail(lang, { base, vendorName: "A&B Roofing", rfpTitle: title, rfpId: "j1", quote: { amount: 4800, kind: "firm", startDate: "2026-11-03", currency: "CAD" } }),
        confirmationEmail(lang, { base, rfpTitle: title, posterKind: "pm", allowance: { unlimited: false, left: 2, limit: 3 } }),
        pickedEmail(lang, { base, rfpTitle: title, posterKind: "gc", company: "A&B", contact: { name: "Dana", company: "Maple", email: "d@x.com", phone: "416 555 0100" } }),
        publishedEmail(lang, { base, title, slug: "s", rfpId: "j1", alertsOn: true }),
        rejectedEmail(lang, { base, title, reason: "Missing <scope>" }),
        jobAlertEmail(lang, { base, title, slug: "s", trade: "Roofing", place: "Toronto, Ontario", deadline: "2026-11-30", summary: "Two leaks", pro: false, freeLimit: 3, unsubscribeUrl: "https://pmrfp.com/api/email/unsubscribe?u=1&t=2", mailingAddress: "123 Example St" }),
      ];
      for (const e of emails) {
        expect(e.subject).not.toMatch(/<[a-z]/i);
        expect(e.bodyHtml).not.toContain("<b>repair</b>");
        expect(e.bodyHtml).not.toContain("<scope>");
        if (lang !== "en") expect(e.bodyHtml).toContain(`${base}/${lang}/`);
      }
      const alert = emails[5];
      expect(alert.footnote).toContain("https://pmrfp.com/api/email/unsubscribe?u=1&t=2");
      expect(alert.footnote).toContain("123 Example St");
      expect(emails[1].bodyHtml).toMatch(/2/);
      expect(emails[2].bodyHtml).toContain("d@x.com");
    });
  }

  it("says the free allowance in the confirmation", () => {
    expect(confirmationEmail("en", { base, rfpTitle: "T", posterKind: "pm", allowance: { unlimited: false, left: 2, limit: 3 } }).bodyHtml).toContain(
      "You have 2 of 3 free responses left this month. Trade Pro is unlimited.",
    );
    expect(confirmationEmail("en", { base, rfpTitle: "T", posterKind: "pm", allowance: { unlimited: true, left: Infinity, limit: Infinity } }).bodyHtml).not.toContain("free responses");
  });
});
