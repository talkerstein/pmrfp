import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * PMRFP for Towns, Part B1: following buyers and towns (free limit, the
 * follow intent through sign-up, which listings a follow catches, who gets
 * same-day emails and the flag that gates them, the Monday roundup's
 * section), the province pages' data, and the admin emails on claims and
 * "list your tenders" requests. No email leaves: without RESEND_API_KEY
 * lib/email/send only logs "[email:noop] to=… subject=…".
 */

const h = vi.hoisted(() => ({ db: null as unknown, pages: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/buyers/load", () => ({ loadBuyers: async () => ({ pages: h.pages, categories: [] }) }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => h.db }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => null, checkRateLimitByIp: async () => false, rateLimitResponse: () => new Response(null, { status: 429 }) }));

import { allTowns } from "@/lib/towns/data";
import { mergeTownsWithDirectory } from "@/lib/towns/merge";
import { DIRECTORY, buildBuyerPages, findBuyerPage, isIndexablePage, type BuyerPage } from "@/lib/buyers/model";
import { filterBuyers, inProvince, provinceDirectory, provinceGroupOf, provinceList, provincePath, type CompactBuyer } from "@/lib/buyers/province";
import { permissionFor } from "@/lib/towns/managed";
import { seedRegistry } from "@/lib/buyers/permissions";
import { buyerDisplayName } from "@/lib/towns/claimable";
import {
  FREE_FOLLOW_LIMIT,
  buyerFollowAlertsEnabled,
  canFollowBuyers,
  followAlertKey,
  followDecision,
  followIntentFrom,
  followIntentPath,
  followLanding,
  followLimit,
  followSignUpHref,
  followUsage,
  parseFollowKey,
} from "@/lib/follows/rules";
import { followBuyer, unfollowBuyer } from "@/lib/follows/server";
import { followedListingsByUser, listingBuyerKeys, planFollowAlerts, weeklyFollowSection, type FollowListing } from "@/lib/follows/alerts";
import { followAlertEmail, weeklyFollowSectionHtml } from "@/lib/follows/email-copy";
import { runBuyerFollowAlerts, weeklyFollowItems } from "@/lib/follows/alerts-server";
import { buyerReviewCounts, notifyAdminOfClaim, notifyAdminOfSourceRequest } from "@/lib/buyers/admin-notify";
import { safeNextPath } from "@/lib/auth/next";
import { onboardingPath, postOAuthRedirect } from "@/lib/auth/oauth";
import { magicLinkRedirect } from "@/lib/auth/magic-link";
import { localizePath } from "@/i18n/config";
import { publicTenderSource } from "@/lib/tenders/sources";
import { hasSessionCookie } from "@/components/follows/use-follows";

type Row = Record<string, unknown>;

let pages: BuyerPage[];
const page = (key: string) => {
  const [p, s] = key.split("/");
  const found = findBuyerPage(pages, p, s);
  if (!found) throw new Error(`no page ${key}`);
  return found;
};

const GUELPH = "ontario/city-of-guelph";
const WELLINGTON_NORTH = "ontario/township-of-wellington-north";
const COBOURG = "ontario/cobourg";
const NANAIMO = "british-columbia/city-of-nanaimo";
const NANAIMO_SLUG = "pothole-repairs-nnmo-0123456789ab";

beforeAll(() => {
  pages = buildBuyerPages({ awards: [], rfps: [], projects: [], towns: mergeTownsWithDirectory(allTowns(), DIRECTORY) });
  h.pages = pages;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ["RESEND_API_KEY", "ADMIN_NOTIFICATION_EMAIL", "BUYER_FOLLOW_ALERTS_ENABLED", "BUSINESS_MAILING_ADDRESS", "UNSUBSCRIBE_SECRET", "CRON_SECRET"]) delete process.env[k];
});

/** Recipients and subjects the no-op mailer logged. */
function mailLog() {
  const spy = vi.spyOn(console, "info").mockImplementation(() => {});
  return () =>
    spy.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith("[email:noop]"))
      .map((l) => ({ to: l.match(/to=(\S+)/)?.[1] ?? "", subject: l.match(/subject="(.*)"$/)?.[1] ?? "" }));
}

/* ------------------------------------------------------------------ limits */

describe("follow limits: free vs Trade Pro", () => {
  it("free accounts follow 3 buyers; Trade Pro and trial are unlimited", () => {
    expect(FREE_FOLLOW_LIMIT).toBe(3);
    expect(followLimit(false)).toBe(3);
    expect(followLimit(true)).toBeNull();
    expect(followDecision({ already: false, used: 2, pro: false })).toBe("followed");
    expect(followDecision({ already: false, used: 3, pro: false })).toBe("limit");
    expect(followDecision({ already: false, used: 300, pro: true })).toBe("followed");
    expect(followDecision({ already: true, used: 3, pro: false })).toBe("already");
  });

  it("reports '2 of 3 free follows used' (and nothing to count for Pro)", () => {
    expect(followUsage(2, false)).toEqual({ used: 2, limit: 3, left: 1, full: false });
    expect(followUsage(3, false)).toMatchObject({ left: 0, full: true });
    expect(followUsage(12, true)).toEqual({ used: 12, limit: null, left: null, full: false });
  });

  it("lets trades and suppliers follow (and anyone with Trade Pro); not property managers or public buyers", () => {
    expect(canFollowBuyers({ primaryRole: "trade", hasTradeAccess: false })).toBe(true);
    expect(canFollowBuyers({ primaryRole: "supplier", hasTradeAccess: false })).toBe(true);
    expect(canFollowBuyers({ primaryRole: "property_manager", hasTradeAccess: false })).toBe(false);
    expect(canFollowBuyers({ primaryRole: "public_buyer", hasTradeAccess: false })).toBe(false);
    expect(canFollowBuyers(null)).toBe(false);
  });

  it("enforces the limit server-side: the database function gets 3 for a free account, null for Pro", async () => {
    const calls: Row[] = [];
    const db = (answer: string, rows: number) => ({
      ...fakeDb({ buyer_follows: Array.from({ length: rows }, (_, i) => ({ user_id: "u1", buyer_slug: `ontario/x-${i}` })) }),
      rpc: async (fn: string, args: Row) => {
        calls.push({ fn, ...args });
        return { data: answer, error: null };
      },
    });
    const free = await followBuyer(db("limit", 3) as never, { userId: "u1", orgId: "o1", key: GUELPH, pro: false });
    expect(free).toEqual({ status: "limit", usage: { used: 3, limit: 3, left: 0, full: true } });
    const pro = await followBuyer(db("followed", 4) as never, { userId: "u1", orgId: "o1", key: GUELPH, pro: true });
    expect(pro.status).toBe("followed");
    expect(calls).toEqual([
      { fn: "follow_buyer", p_user: "u1", p_org: "o1", p_key: GUELPH, p_limit: 3 },
      { fn: "follow_buyer", p_user: "u1", p_org: "o1", p_key: GUELPH, p_limit: null },
    ]);
  });

  it("answers 'unavailable' before the migration runs, and unfollows", async () => {
    const missing = { ...fakeDb({}), rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.follow_buyer in the schema cache" } }) };
    expect((await followBuyer(missing as never, { userId: "u1", orgId: null, key: GUELPH, pro: false })).status).toBe("unavailable");
    const db = fakeDb({ buyer_follows: [{ user_id: "u1", buyer_slug: GUELPH }, { user_id: "u2", buyer_slug: GUELPH }] });
    expect(await unfollowBuyer(db as never, { userId: "u1", key: GUELPH, pro: false })).toEqual({ status: "unfollowed", usage: { used: 0, limit: 3, left: 3, full: false } });
    expect(db.tables.buyer_follows).toEqual([{ user_id: "u2", buyer_slug: GUELPH }]);
  });

  it("only takes real page keys", () => {
    expect(parseFollowKey(GUELPH)).toBe(GUELPH);
    for (const bad of ["guelph", "Ontario/City", "ontario/../admin", "", null, 3]) expect(parseFollowKey(bad)).toBeNull();
  });
});

/* ------------------------------------------------------------------ intent */

describe("a signed-out follow survives sign-up and onboarding", () => {
  const base = "https://pmrfp.com";
  const nextOf = (path: string) => new URL(path, base).searchParams.get("next");

  for (const lang of ["en", "fr"] as const) {
    it(`keeps the follow in \`next\` through every sign-up path (${lang})`, () => {
      const intent = localizePath(followIntentPath(WELLINGTON_NORTH), lang);
      const signUp = followSignUpHref(intent, "ontario");
      expect(signUp).toContain("role=trade");
      expect(signUp).toContain("region=ontario");
      // The sign-up page reads ?next= and accepts it as a safe local path.
      const next = safeNextPath(nextOf(signUp));
      expect(next).toBe(intent);
      expect(followIntentFrom(next)).toBe(WELLINGTON_NORTH);
      // Password sign-up → /onboarding?next=… (lib/auth/actions signUpAction).
      expect(followIntentFrom(safeNextPath(nextOf(`/onboarding?next=${encodeURIComponent(next!)}`)))).toBe(WELLINGTON_NORTH);
      // Google → /onboarding with next (lib/auth/oauth).
      expect(followIntentFrom(nextOf(onboardingPath({ next })))).toBe(WELLINGTON_NORTH);
      // Emailed link → /auth/callback?next=… → onboarding (new account) or straight to /follow (existing one).
      const callback = magicLinkRedirect(base, next);
      const back = nextOf(callback);
      expect(followIntentFrom(nextOf(postOAuthRedirect(back, { onboardingCompleted: false, home: "/dashboard" })))).toBe(WELLINGTON_NORTH);
      expect(followIntentFrom(postOAuthRedirect(back, { onboardingCompleted: true, home: "/dashboard" }))).toBe(WELLINGTON_NORTH);
    });
  }

  it("completes the follow after onboarding, but never from another site's link", () => {
    const trade = { signedIn: true, onboarded: true, canFollow: true };
    expect(followLanding({ signedIn: false, onboarded: false, canFollow: false, fetchSite: "same-origin" })).toBe("sign-up");
    expect(followLanding({ ...trade, onboarded: false, fetchSite: "same-origin" })).toBe("onboarding");
    // Back from onboarding (a same-origin redirect) or a link opened from outside the browser: follow now.
    expect(followLanding({ ...trade, fetchSite: "same-origin" })).toBe("follow");
    expect(followLanding({ ...trade, fetchSite: "none" })).toBe("follow");
    expect(followLanding({ ...trade, fetchSite: null })).toBe("follow");
    // Another site's link, or a prefetch: one click to confirm.
    expect(followLanding({ ...trade, fetchSite: "cross-site" })).toBe("confirm");
    expect(followLanding({ ...trade, fetchSite: "same-site" })).toBe("confirm");
    expect(followLanding({ ...trade, fetchSite: "same-origin", prefetch: true })).toBe("confirm");
    expect(followLanding({ signedIn: true, onboarded: false, canFollow: false, fetchSite: "same-origin" })).toBe("not-allowed");
  });

  it("ignores paths that aren't a follow", () => {
    expect(followIntentFrom("/buyers/ontario/cobourg")).toBeNull();
    expect(followIntentFrom("/follow?buyer=../../admin")).toBeNull();
    expect(followIntentFrom("/es/follow?buyer=ontario%2Fcobourg")).toBe(COBOURG);
    expect(followIntentFrom(null)).toBeNull();
  });

  it("only asks the API when a sign-in cookie is there", () => {
    expect(hasSessionCookie("sb-abcd-auth-token=xyz; other=1")).toBe(true);
    expect(hasSessionCookie("a=1; sb-abcd-auth-token.0=xyz")).toBe(true);
    expect(hasSessionCookie("NEXT_LOCALE=fr; pmrfp_geo=CA-ON")).toBe(false);
  });
});

/* ------------------------------------------------------------------ alerts */

const NOW = new Date("2026-10-21T15:00:00Z");
const listing = (x: Partial<FollowListing> & { id: string; slug: string }): FollowListing => ({
  title: x.slug,
  summary: null,
  deadline: "2026-11-15",
  province: "Ontario",
  sourceType: "public_source",
  postedByOrganizationId: null,
  publishedAt: "2026-10-21T12:10:00Z",
  ...x,
});

const LISTINGS: FollowListing[] = [
  listing({ id: "l-wn", slug: "arthur-office-renovation-ab12", title: "Arthur office renovation", summary: "Public tender from Township of Wellington North." }),
  listing({ id: "l-gu", slug: "roof-replacement-cd34", title: "Roof replacement, transit garage", summary: "Public tender from the City of Guelph." }),
  // Same name, other province: never Guelph's.
  listing({ id: "l-bc", slug: "snow-removal-ef56", title: "Snow removal", summary: "Public tender from the City of Guelph.", province: "British Columbia" }),
  // Naming a different township.
  listing({ id: "l-cw", slug: "fergus-paving-gh78", title: "Fergus paving", summary: "Public tender from Township of Centre Wellington." }),
  // A verified town's own post (B2) and a listing imported with Nanaimo's permission.
  listing({ id: "l-co", slug: "arena-janitorial-ij90", title: "Arena janitorial", sourceType: "property_manager_direct", postedByOrganizationId: "org-cobourg" }),
  listing({ id: "l-na", slug: NANAIMO_SLUG, title: "Pothole repairs", province: "British Columbia" }),
  // The U.S. never mixes in.
  listing({ id: "l-us", slug: "guelph-street-kl12", title: "City of Guelph street", summary: "City of Guelph", province: "New York" }),
];

const permissionOf = (slug: string) => {
  const p = publicTenderSource(slug).permission;
  return p ? { buyerSlug: p.buyerSlug, provinceCode: "BC" } : null;
};

describe("which listings a follow catches", () => {
  it("matches public tenders, permission imports and a verified buyer's own posts, by province, Canada only", () => {
    const wanted = new Set([GUELPH, WELLINGTON_NORTH, COBOURG, NANAIMO]);
    const keys = listingBuyerKeys(LISTINGS, { pages, wanted, managedByOrg: new Map([["org-cobourg", COBOURG]]), permissionOf });
    expect(Object.fromEntries(keys)).toEqual({
      "l-wn": [WELLINGTON_NORTH],
      "l-gu": [GUELPH],
      "l-co": [COBOURG],
      "l-na": [NANAIMO],
    });
  });

  it("finds nothing for pages nobody follows", () => {
    expect(listingBuyerKeys(LISTINGS, { pages, wanted: new Set(), managedByOrg: new Map(), permissionOf }).size).toBe(0);
  });
});

describe("who gets a same-day email (Trade Pro and trial), deduped against category alerts", () => {
  const keys = () => listingBuyerKeys(LISTINGS, { pages, wanted: new Set([GUELPH, WELLINGTON_NORTH]), managedByOrg: new Map(), permissionOf });
  const follows = [
    { userId: "pro", key: GUELPH },
    { userId: "pro", key: WELLINGTON_NORTH },
    { userId: "free", key: WELLINGTON_NORTH },
    { userId: "pro-cat", key: GUELPH },
    { userId: "pro-off", key: GUELPH },
    { userId: "pro-weekly", key: GUELPH },
    { userId: "pro-gone", key: GUELPH },
  ];
  const users = new Map([
    ["pro", { email: "pro@roofs.ca", status: "active" }],
    ["free", { email: "free@roofs.ca", status: "active" }],
    ["pro-cat", { email: "cat@roofs.ca", status: "active" }],
    ["pro-off", { email: "off@roofs.ca", status: "active" }],
    ["pro-weekly", { email: "weekly@roofs.ca", status: "active" }],
    ["pro-gone", { email: "gone@roofs.ca", status: "suspended" }],
  ]);

  it("emails Pro followers once, skips free ones (Monday roundup) and anything category alerts already sent", () => {
    const byUser = followedListingsByUser(LISTINGS, keys(), follows);
    expect(byUser.get("pro")?.map((i) => i.listing.id).sort()).toEqual(["l-gu", "l-wn"]);
    const plan = planFollowAlerts({
      byUser,
      users,
      pro: new Set(["pro", "pro-cat", "pro-off", "pro-weekly", "pro-gone"]),
      optedOut: new Set(["pro-off"]),
      weekly: new Set(["pro-weekly"]),
      // The daily category digest already sent pro-cat the Guelph roof.
      sentRfp: new Set(["pro-cat|roof-replacement-cd34"]),
      sentFollow: new Set(),
    });
    expect(plan.recipients.map((r) => [r.userId, r.items.map((i) => i.listing.id).sort()])).toEqual([["pro", ["l-gu", "l-wn"]]]);
    expect(plan.items).toBe(2);
    expect(plan.skipped).toEqual({ free: 1, optedOut: 1, weekly: 1, alreadySent: 1, noEmail: 1 });
  });

  it("never sends a listing twice (an earlier follow alert)", () => {
    const plan = planFollowAlerts({
      byUser: followedListingsByUser(LISTINGS, keys(), follows),
      users,
      pro: new Set(["pro"]),
      optedOut: new Set(),
      weekly: new Set(),
      sentRfp: new Set(),
      sentFollow: new Set(["pro|l-gu", "pro|l-wn"]),
    });
    expect(plan.recipients).toEqual([]);
  });

  it("gives free followers a 'From buyers you follow' section without repeats", () => {
    const items = followedListingsByUser(LISTINGS, keys(), follows).get("free");
    expect(weeklyFollowSection(items, { alreadyListed: new Set(), userId: "free" }).map((i) => i.listing.id)).toEqual(["l-wn"]);
    expect(weeklyFollowSection(items, { alreadyListed: new Set(["l-wn"]), userId: "free" })).toEqual([]);
    const html = weeklyFollowSectionHtml("https://pmrfp.com", [{ title: "Arthur <office>", slug: "a", deadline: "2026-11-15", buyer: "Township of Wellington North" }], { sameDay: false });
    expect(html).toContain("From buyers you follow");
    expect(html).toContain("Arthur &lt;office&gt;");
    expect(html).not.toContain("same day");
    expect(weeklyFollowSectionHtml("https://pmrfp.com", [], { sameDay: true })).toBe("");
  });

  it("writes the email in the member's language, with the CASL footer and unsubscribe", () => {
    const e = followAlertEmail("fr", {
      base: "https://pmrfp.com",
      items: [{ title: "Réfection de toiture", slug: "r", deadline: "2026-11-15", buyer: "Ville de Guelph" }],
      unsubscribeUrl: "https://pmrfp.com/api/email/unsubscribe?u=1&t=2",
      mailingAddress: "123 Example St, Toronto",
    });
    expect(e.subject).toBe("Nouvel appel d'offres de Ville de Guelph : Réfection de toiture");
    expect(e.bodyHtml).toContain("https://pmrfp.com/fr/rfps/r");
    expect(e.footnote).toContain("https://pmrfp.com/api/email/unsubscribe?u=1&amp;t=2".replace("&amp;", "&"));
    expect(e.footnote).toContain("123 Example St, Toronto");
    expect(e.footnote).toContain("/fr/dashboard/following");
    expect(followAlertEmail("en", { base: "b", items: [{ title: "a", slug: "a", deadline: null, buyer: "X" }, { title: "b", slug: "b", deadline: null, buyer: "Y" }], unsubscribeUrl: "u", mailingAddress: "m" }).subject).toBe("2 new bids from buyers you follow");
  });
});

/* ------------------------------------------------------------------ the flag */

function alertDb(): FakeDb {
  const rfp = (l: FollowListing) => ({
    id: l.id,
    slug: l.slug,
    title: l.title,
    summary: l.summary,
    deadline: l.deadline,
    province: l.province,
    source_type: l.sourceType,
    posted_by_organization_id: l.postedByOrganizationId,
    published_at: l.publishedAt,
    status: "published",
    is_demo: false,
  });
  return fakeDb(
    {
      buyer_follows: [
        { user_id: "pro", buyer_slug: GUELPH },
        { user_id: "pro", buyer_slug: WELLINGTON_NORTH },
        { user_id: "free", buyer_slug: WELLINGTON_NORTH },
        { user_id: "pro-cat", buyer_slug: GUELPH },
      ],
      rfp_posts: LISTINGS.map(rfp),
      buyer_pages: [],
      users_profile: [
        { id: "pro", email: "pro@roofs.ca", status: "active" },
        { id: "free", email: "free@roofs.ca", status: "active" },
        { id: "pro-cat", email: "cat@roofs.ca", status: "active" },
      ],
      notification_preferences: [],
      notifications: [{ id: "n1", user_id: "pro-cat", type: "rfp_alert", link_url: "/rfps/roof-replacement-cd34", created_at: "2026-10-21T13:00:30Z" }],
      lead_alert_log: [],
      organization_members: [
        { user_id: "pro", organization_id: "org-pro" },
        { user_id: "free", organization_id: "org-free" },
        { user_id: "pro-cat", organization_id: "org-pro-cat" },
      ],
      subscriptions: [
        { organization_id: "org-pro", status: "active", tier: "pro" },
        { organization_id: "org-pro-cat", status: "active", tier: "pro" },
      ],
      trade_trials: [],
      signup_attribution: [{ user_id: "pro", lang: "en" }],
    },
    { unique: { lead_alert_log: (a, b) => a.user_id === b.user_id && a.lead_key === b.lead_key } },
  );
}

describe("BUYER_FOLLOW_ALERTS_ENABLED gates the same-day emails", () => {
  it("is off unless set to 1 or true", () => {
    expect(buyerFollowAlertsEnabled(undefined)).toBe(false);
    expect(buyerFollowAlertsEnabled("0")).toBe(false);
    expect(buyerFollowAlertsEnabled("1")).toBe(true);
    expect(buyerFollowAlertsEnabled("true")).toBe(true);
  });

  it("off: counts what would go out (the admin's dry run) and sends and writes nothing", async () => {
    const mails = mailLog();
    const db = alertDb();
    const run = await runBuyerFollowAlerts(db as never, { enabled: false, now: NOW });
    expect(run).toMatchObject({ state: "off", enabled: false, followers: 3, wouldEmail: 1, wouldList: 2, sent: 0 });
    expect(run.skipped).toMatchObject({ free: 1, alreadySent: 1 });
    expect(mails()).toEqual([]);
    expect(db.tables.lead_alert_log).toEqual([]);
    expect(db.calls.some((c) => c.op !== "select")).toBe(false);
    expect((await runBuyerFollowAlerts(db as never, { dry: true, enabled: true, now: NOW })).state).toBe("dry");
    expect(mails()).toEqual([]);
  });

  it("on: refuses without the CASL mailing address", async () => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
    const run = await runBuyerFollowAlerts(alertDb() as never, { enabled: true, now: NOW });
    expect(run).toMatchObject({ state: "blocked", reason: "mailing_address", sent: 0 });
  });

  it("on: emails each Pro follower once, logs it, and the next run sends nothing", async () => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
    process.env.BUSINESS_MAILING_ADDRESS = "123 Example St, Toronto";
    const mails = mailLog();
    const db = alertDb();
    const run = await runBuyerFollowAlerts(db as never, { enabled: true, now: NOW });
    expect(run).toMatchObject({ state: "sent", sent: 1 });
    expect(mails()).toEqual([{ to: "pro@roofs.ca", subject: "2 new bids from buyers you follow" }]);
    expect(db.tables.lead_alert_log.map((r) => [r.user_id, r.lead_key]).sort()).toEqual([
      ["pro", followAlertKey("l-gu")],
      ["pro", followAlertKey("l-wn")],
    ]);
    // In-app, and the daily category digest won't send them again (same type + link).
    expect(db.tables.notifications.filter((n) => n.user_id === "pro").map((n) => [n.type, n.link_url]).sort()).toEqual([
      ["rfp_alert", "/rfps/arthur-office-renovation-ab12"],
      ["rfp_alert", "/rfps/roof-replacement-cd34"],
    ]);
    const again = await runBuyerFollowAlerts(db as never, { enabled: true, now: NOW });
    expect(again).toMatchObject({ sent: 0, wouldEmail: 0 });
    expect(mails()).toHaveLength(1);
  });

  it("the hourly cron skips straight away while the flag is off", async () => {
    h.db = alertDb();
    const { GET } = await import("@/app/api/cron/buyer-follow-alerts/route");
    const res = await GET(new Request("https://pmrfp.com/api/cron/buyer-follow-alerts"));
    expect(await res.json()).toEqual({ skipped: "BUYER_FOLLOW_ALERTS_ENABLED is off", enabled: false });
    const dry = await (await GET(new Request("https://pmrfp.com/api/cron/buyer-follow-alerts?dry=1"))).json();
    expect(dry).toMatchObject({ dry: true, state: "dry", wouldEmail: 1 });
  });

  it("the Monday roundup reads each free follower's week", async () => {
    const { byUser, names } = await weeklyFollowItems(alertDb() as never, { userIds: ["free"], since: "2026-10-14T00:00:00Z", today: "2026-10-21" });
    expect(byUser.get("free")?.map((i) => i.listing.id)).toEqual(["l-wn"]);
    expect(names.get(WELLINGTON_NORTH)).toBe("Township of Wellington North");
  });
});

/* ------------------------------------------------------------------ indexing */

describe("followers never make a page indexable", () => {
  it("keeps an empty town page noindex whatever its followers (Part A's rule only)", () => {
    const p = page(WELLINGTON_NORTH);
    expect(p.openBids).toEqual([]);
    expect(isIndexablePage(p, { managed: false, permissionYes: false })).toBe(false);
    // The rule's only inputs are content, a verified buyer and permission.
    expect(isIndexablePage(p, { managed: true, permissionYes: false })).toBe(true);
  });
});

/* ------------------------------------------------------------------ province pages */

describe("province pages (/buyers/<province>)", () => {
  const registry = seedRegistry();
  const signals = (managed: Set<string> = new Set()) => ({
    managed: (p: BuyerPage) => managed.has(`${p.provinceSlug}/${p.buyer.slug}`),
    listed: (p: BuyerPage) => permissionFor(registry, p.buyer.slug, p.buyer.provinceCode)?.status === "yes",
    name: (p: BuyerPage) => buyerDisplayName(p, "en"),
  });
  const find = (items: CompactBuyer[], s: string) => items.find((i) => i.s === s);

  it("lists every town and buyer in the province, grouped by kind", () => {
    const dir = provinceDirectory(pages, "ontario", signals(new Set([COBOURG])))!;
    expect(dir).toMatchObject({ province: "Ontario", provinceSlug: "ontario", provinceCode: "ON" });
    expect(dir.total).toBe(pages.filter((p) => p.provinceSlug === "ontario").length);
    expect(dir.total).toBeGreaterThan(450);
    expect(dir.groups.map((g) => g.group).slice(0, 3)).toEqual(["cities", "towns", "townships"]);
    expect(find(dir.items, "city-of-guelph")).toMatchObject({ n: "City of Guelph", g: "cities", p: 143740 });
    expect(find(dir.items, "cobourg")).toMatchObject({ n: "Town of Cobourg", g: "towns", v: 1 });
    expect(find(dir.items, "township-of-wellington-north")).toMatchObject({ g: "townships", p: 12431 });
    expect(find(dir.items, "wellington-county")?.g).toBe("counties");
    expect(find(dir.items, "wellington-catholic-dsb")?.g).toBe("school");
    expect(find(dir.items, "university-of-guelph")?.g).toBe("postSecondary");
    expect(dir.verified).toBe(1);
    // Grouped in page order, A–Z by place within a group.
    const order = dir.items.map((i) => i.g);
    expect(order).toEqual([...order].sort((a, b) => dir.groups.findIndex((g) => g.group === a) - dir.groups.findIndex((g) => g.group === b)));
  });

  it("badges: listed with permission and open bids", () => {
    const withBids = buildBuyerPages({
      awards: [],
      rfps: [{ slug: "transit-roof-ab12", title: "Transit garage roof", summary: "Public tender from the City of Guelph.", province: "Ontario", deadline: "2099-01-01", status: "open", sourceType: "public_source", categories: [], regionName: null, propertyTypeName: null, city: null, isDemo: false, photoUrls: [] }],
      projects: [],
      towns: mergeTownsWithDirectory(allTowns(), DIRECTORY),
    });
    const on = provinceDirectory(withBids, "ontario", signals())!;
    expect(find(on.items, "city-of-guelph")?.o).toBe(1);
    expect(on.withOpen).toBe(1);
    const bc = provinceDirectory(withBids, "british-columbia", signals())!;
    expect(find(bc.items, "city-of-nanaimo")).toMatchObject({ l: 1 });
  });

  it("splits Québec's villes into cities and towns by size", () => {
    const qc = provinceDirectory(pages, "quebec", { ...signals(), name: (p) => buyerDisplayName(p, "fr") })!;
    expect(find(qc.items, "ville-de-gatineau")?.g).toBe("cities");
    expect(provinceGroupOf({ buyer: page(GUELPH).buyer, town: { ...page(GUELPH).town!, type: "Ville", population: 4000 } })).toBe("towns");
  });

  it("searches without accents, by every word, and filters to buyers with open bids", () => {
    const items: CompactBuyer[] = [
      { n: "Ville de Saint-Félicien", s: "a", g: "cities" },
      { n: "City of Guelph", s: "b", g: "cities", o: 2 },
      { n: "University of Guelph", s: "c", g: "postSecondary" },
    ];
    expect(filterBuyers(items, "saint felicien").map((i) => i.s)).toEqual(["a"]);
    expect(filterBuyers(items, "GUELPH").map((i) => i.s)).toEqual(["b", "c"]);
    expect(filterBuyers(items, "guelph univ").map((i) => i.s)).toEqual(["c"]);
    expect(filterBuyers(items, "", true).map((i) => i.s)).toEqual(["b"]);
  });

  it("says 'au Québec' and 'en Ontario' in French", () => {
    expect(inProvince("Quebec", "fr", "Québec")).toBe("au Québec");
    expect(inProvince("Ontario", "fr", "Ontario")).toBe("en Ontario");
    expect(inProvince("Northwest Territories", "fr", "Territoires du Nord-Ouest")).toBe("dans les Territoires du Nord-Ouest");
    expect(inProvince("Quebec", "en", "Quebec")).toBe("in Quebec");
    expect(inProvince("Nova Scotia", "es", "Nueva Escocia")).toBe("en Nueva Escocia");
  });

  it("has a page for every province and territory (Ontario first) and nothing else", () => {
    const list = provinceList(pages);
    expect(list[0].provinceSlug).toBe("ontario");
    expect(list).toHaveLength(13);
    expect(provincePath("nova-scotia")).toBe("/buyers/nova-scotia");
    expect(provinceDirectory(pages, "new-york", signals())).toBeNull();
  });
});

/* ------------------------------------------------------------------ admin emails */

describe("admin emails on claims and requests", () => {
  const counts = () =>
    fakeDb({
      buyer_claims: [{ id: "c1", status: "pending" }, { id: "c2", status: "verified" }],
      buyer_source_requests: [{ id: "r1", status: "new" }, { id: "r2", status: "approved" }],
    });

  it("counts what waits (the admin nav badge)", async () => {
    expect(await buyerReviewCounts(counts() as never)).toEqual({ claims: 1, requests: 1 });
    expect(await buyerReviewCounts(fakeDb({}) as never)).toEqual({ claims: 0, requests: 0 });
  });

  it("a claim waiting for review goes to info@pmrfp.com while ADMIN_NOTIFICATION_EMAIL is unset", async () => {
    const mails = mailLog();
    await notifyAdminOfClaim(counts() as never, {
      status: "pending",
      reason: "free_mail",
      buyer: { name: "Town of Cobourg", key: COBOURG, provinceCode: "ON" },
      who: { email: "clerk@gmail.com", fullName: "Pat Clerk", jobTitle: "Treasurer" },
    });
    expect(mails()).toEqual([{ to: "info@pmrfp.com", subject: "Buyer page claim to check (2 waiting): Town of Cobourg (ON)" }]);
  });

  it("verified claims and join requests are emailed too; failed claims aren't", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = "ops@pmrfp.com";
    const mails = mailLog();
    const buyer = { name: "Town of Cobourg", key: COBOURG, provinceCode: "ON" };
    const who = { email: "clerk@cobourg.ca", fullName: null, jobTitle: null };
    await notifyAdminOfClaim(counts() as never, { status: "verified", buyer, who });
    await notifyAdminOfClaim(counts() as never, { status: "join_requested", buyer, who });
    await notifyAdminOfClaim(counts() as never, { status: "error", buyer, who });
    expect(mails()).toEqual([
      { to: "ops@pmrfp.com", subject: "Buyer page claimed and verified: Town of Cobourg (ON)" },
      { to: "ops@pmrfp.com", subject: "Join request for a managed buyer page: Town of Cobourg (ON)" },
    ]);
  });

  it("a /for-public-buyers request emails the admin inbox from the route", async () => {
    const mails = mailLog();
    const db = fakeDb({ buyer_source_requests: [], users_profile: [{ id: "a1", primary_role: "admin", status: "active" }], notifications: [], buyer_claims: [] });
    h.db = db;
    const { POST } = await import("@/app/api/buyer-sources/route");
    const res = await POST(
      new Request("https://pmrfp.com/api/buyer-sources", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://pmrfp.com" },
        body: JSON.stringify({
          organization: "Township of Wellington North",
          contactName: "Pat Clerk",
          workEmail: "pat@wellington-north.com",
          tendersUrl: "https://www.wellington-north.com/bids",
          method: "email_notices",
          provinceCode: "ON",
          authorized: true,
          lang: "en",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(db.tables.buyer_source_requests).toHaveLength(1);
    expect(db.tables.notifications).toHaveLength(1);
    expect(mails()).toEqual([{ to: "info@pmrfp.com", subject: "Public buyer wants to list its tenders: Township of Wellington North (ON)" }]);
  });

  it("the request email names the method in plain English", async () => {
    const mails = mailLog();
    await notifyAdminOfSourceRequest(counts() as never, {
      organization: "City of Nanaimo",
      contactName: "A",
      workEmail: "a@nanaimo.ca",
      tendersUrl: "https://nanaimo.ca/bids",
      method: "feed",
      provinceCode: "BC",
    });
    expect(mails()[0].subject).toBe("Public buyer wants to list its tenders (2 waiting): City of Nanaimo (BC)");
  });
});
