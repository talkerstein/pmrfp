import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { renderToStaticMarkup } from "react-dom/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RfpListItem } from "@/lib/data/types";
import {
  RETENDER_LEAD_MONTHS,
  addMonths,
  buyerIndex,
  buyerProfile,
  buyerRefs,
  companyIndex,
  companyProfile,
  intelAwards,
  intelCoverage,
  marketIndex,
  marketShare,
  parseTerm,
  rebidMonths,
  renewalFor,
  renewalRadar,
  termStatedShare,
  trendOf,
} from "@/lib/intel/model";
import { buyerTeaser, companyTeaser, intelView, marketTeaser, renewalTeaser } from "@/lib/intel/view";
import { companyCsv, csvCell, marketCsv, renewalsCsv } from "@/lib/intel/csv";
import { INTEL_PRICES, intelCheckoutEnabled, intelPayable, intelPrice, intelPriceInfo, intelStripePrice } from "@/lib/intel/pricing";
import { intelEntitled, intelStatusFromStripe, isIntelRowActive } from "@/lib/entitlement/intel";
import { intelRowFromSubscription, shouldApplyIntelSync } from "@/lib/intel/stripe-rules";
import { loadSessionContext } from "@/lib/access/access";
import { BuyerBody, CompanyBody, MarketBody, RenewalsBody, type IntelCtx } from "@/components/intel/views";
import intelMessages from "@/i18n/messages/intel";

const TODAY = "2026-10-16";

let seq = 0;
/** A past public contract ("-cba-" = Government of Canada award notice). */
function award(o: {
  winner?: string;
  amount?: number | null;
  currency?: "CAD" | "USD";
  date?: string;
  buyer?: string;
  province?: string | null;
  city?: string | null;
  trades?: string[];
  title?: string;
}): RfpListItem {
  const i = ++seq;
  const { winner = "Northline Snow Services Ltd", amount = 50_000, currency = "CAD", date = "2026-03-01", buyer = "City of Halifax", province = "NS", city = null, trades = ["Snow Removal"], title = `Snow clearing ${i}` } = o;
  const value = amount === null ? "value not disclosed" : `$${amount.toLocaleString("en-US")} ${currency}`;
  return {
    slug: `t-${i}-cba-w${i}`,
    title,
    summary: `Awarded March 1, 2026 to ${winner} (Town) — ${value}. Past public contract issued by ${buyer}.`,
    categories: trades,
    regionName: null,
    propertyTypeName: null,
    city,
    province,
    deadline: date,
    isDemo: false,
    photoUrls: [],
    status: "closed",
    sourceType: "public_source",
  };
}

const board = (): RfpListItem[] => [
  award({ winner: "Northline Snow Services Ltd", amount: 100_000, date: "2026-05-10", title: "Snow clearing 2026-2029" }),
  award({ winner: "Northline Snow Services Ltd", amount: 50_000, date: "2026-02-01", buyer: "Province of Nova Scotia" }),
  award({ winner: "NORTHLINE SNOW SERVICES LTD.", amount: null, date: "2025-11-20", city: "Halifax" }),
  award({ winner: "Bluewater Janitorial Inc", amount: 30_000, date: "2026-06-01", trades: ["Cleaning / Janitorial"], title: "Janitorial services" }),
  award({ winner: "Bluewater Janitorial Inc", amount: 20_000, date: "2026-07-01", trades: ["Cleaning / Janitorial"], title: "Janitorial services 2" }),
  award({ winner: "Alain Roy", amount: 9_000, date: "2026-04-01" }), // an individual: counted, never named
  award({ winner: "Lone Star Roofing LLC", amount: 80_000, currency: "USD", province: "TX", buyer: "City of Austin", trades: ["Roofing"], date: "2026-04-04" }),
  award({ winner: "Wrong Currency Ltd", amount: 70_000, currency: "CAD", province: "TX", buyer: "City of Dallas" }), // CAD in Texas: dropped
  award({ winner: "Boiler Co Ltd", amount: 400_000, trades: ["HVAC"], title: "Boiler replacement" }), // one-off HVAC project: not on the radar
];

const awards = () => intelAwards(board());

describe("award rows", () => {
  it("keeps each award in its own country and currency, drops mismatched currencies, never names individuals", () => {
    const a = awards();
    expect(a).toHaveLength(8);
    expect(a.find((x) => x.winner === "Lone Star Roofing LLC")).toMatchObject({ country: "US", currency: "USD", province: "Texas" });
    expect(a.some((x) => x.buyer === "City of Dallas")).toBe(false);
    const person = a.find((x) => x.amount === 9_000)!;
    expect(person.winner).toBeNull();
    expect(person.winnerSlug).toBeNull();
    expect(a.every((x) => x.country === "US" ? x.currency === "USD" : x.currency === "CAD")).toBe(true);
  });
});

describe("competitor profiles", () => {
  it("adds up wins, value, buyers, trades and places for one company in one country", () => {
    const a = awards();
    const slug = a.find((x) => x.winner?.startsWith("Northline"))!.winnerSlug!;
    const p = companyProfile(a, slug, "CA", TODAY)!;
    expect(p.name).toBe("Northline Snow Services Ltd");
    expect(p.stats).toMatchObject({ awards: 3, valued: 2, total: 150_000, average: 75_000, median: 75_000 });
    expect(p.buyers.map((b) => [b.name, b.awards])).toEqual([["City of Halifax", 2], ["Province of Nova Scotia", 1]]);
    expect(p.trades[0]).toMatchObject({ name: "Snow Removal", awards: 3 });
    expect(p.provinces[0]).toMatchObject({ name: "Nova Scotia", awards: 3 });
    expect(p.byYear.map((y) => [y.year, y.awards])).toEqual([["2025", 1], ["2026", 2]]);
    expect(p.awards[0].date).toBe("2026-05-10");
    expect(p.currency).toBe("CAD");
    expect(companyProfile(a, "no-such-company", "CA", TODAY)).toBeNull();
  });

  it("never mixes countries: a U.S. view of a Canadian company is empty and points back", () => {
    const a = awards();
    const slug = a.find((x) => x.winner?.startsWith("Northline"))!.winnerSlug!;
    const us = companyProfile(a, slug, "US", TODAY)!;
    expect(us.stats.awards).toBe(0);
    expect(us.otherCountryAwards).toBe(3);
    expect(companyIndex(a, "CA", 2).map((c) => c.name)).toEqual(["Northline Snow Services Ltd", "Bluewater Janitorial Inc"]);
    expect(companyIndex(a, "US", 1).map((c) => c.name)).toEqual(["Lone Star Roofing LLC"]);
  });

  it("says when there isn't enough history for a trend instead of calling everyone new", () => {
    const a = awards();
    const slug = a.find((x) => x.winner?.startsWith("Northline"))!.winnerSlug;
    const rows = a.filter((x) => x.winnerSlug === slug);
    expect(trendOf(rows, TODAY, "2025-10-14").direction).toBe("short-history");
    const older = [...rows, { ...rows[0], date: "2025-03-01" }, { ...rows[0], date: "2025-04-01" }, { ...rows[0], date: "2025-05-01" }];
    const tr = trendOf(older, TODAY, "2024-01-01");
    expect(tr.last12.awards).toBe(3);
    expect(tr.prev12.awards).toBe(3);
    expect(tr.direction).toBe("flat");
    expect(trendOf(rows, TODAY, "2024-01-01").direction).toBe("new");
  });
});

describe("buyer profiles", () => {
  it("spend by trade and year, incumbents and every supplier, individuals counted not named", () => {
    const a = awards();
    const refs = buyerRefs(a);
    const ref = refs.find((r) => r.name === "City of Halifax")!;
    expect(ref.slug).toBe("city-of-halifax");
    const p = buyerProfile(a, ref);
    expect(p.stats.awards).toBe(6);
    expect(p.incumbents.map((s) => s.name)).toEqual(["Northline Snow Services Ltd", "Bluewater Janitorial Inc"]);
    expect(p.individuals).toBe(1);
    expect(p.suppliers.some((s) => s.name === "Alain Roy")).toBe(false);
    const snow = p.tradeYear.find((r) => r.tradeSlug === "snow-removal")!;
    expect(snow.years["2026"]).toEqual({ awards: 2, value: 109_000 });
    expect(snow.years["2025"]).toEqual({ awards: 1, value: 0 });
    expect(p.years).toEqual(["2025", "2026"]);
    // A U.S. buyer gets its own slug and never shows up in Canada's index.
    expect(refs.find((r) => r.name === "City of Austin")).toMatchObject({ country: "US", slug: "city-of-austin-us" });
    expect(buyerIndex(a, refs, "CA", 1).some((b) => b.name === "City of Austin")).toBe(false);
  });
});

describe("market share", () => {
  it("ranks winners by count and value, measures concentration and flags new entrants", () => {
    const a = awards();
    const m = marketShare(a, "snow-removal", "Nova Scotia", TODAY)!;
    expect(m.stats.awards).toBe(4);
    expect(m.winners.map((w) => [w.name, w.awards])).toEqual([["Northline Snow Services Ltd", 3]]);
    expect(m.winners[0].shareCount).toBe(75);
    expect(m.individuals).toBe(1);
    expect(m.concentration).toBe("thin"); // under 5 awards: no verdict
    expect(m.newEntrants).toHaveLength(0); // first award 2025-11-20
    const many = intelAwards([
      ...Array.from({ length: 6 }, (_, i) => award({ winner: "Big Plow Ltd", amount: 90_000, date: `2026-0${i + 1}-02` })),
      award({ winner: "Small Plow Ltd", amount: 10_000, date: "2026-08-01" }),
    ]);
    const big = marketShare(many, "snow-removal", "Nova Scotia", TODAY)!;
    expect(big.hhiBasis).toBe("value");
    expect(big.winners[0].shareValue).toBeCloseTo(98.2, 1);
    expect(big.concentration).toBe("high");
    expect(big.hhi).toBeGreaterThan(9000);
    expect(big.newEntrants.map((w) => w.name)).toEqual(["Big Plow Ltd", "Small Plow Ltd"]);
    expect(big.top3ShareCount).toBe(100);
    expect(marketShare(a, "snow-removal", "Ontario", TODAY)).toBeNull();
    expect(marketIndex(a, "CA", 1).every((r) => r.province !== "Texas")).toBe(true);
  });
});

describe("renewal radar: term estimation and labels", () => {
  it("reads the term the notice states", () => {
    expect(parseTerm("Services de déneigement - secteur Mirabel - hivers 2026-2027 à 2029-2030", "2026-09-25")).toMatchObject({ source: "stated-years", startYear: 2026, endYear: 2030, months: 48 });
    expect(parseTerm("Contrat de déneigement saisons 2026-2027, 2027-2028 et 2028-2029", "2026-07-06")).toMatchObject({ source: "stated-years", endYear: 2029, months: 36 });
    expect(parseTerm("Déneigement des chemins municipaux - secteur B 26-27,27-28,28-29", "2026-09-02")).toMatchObject({ source: "stated-years", startYear: 2026, endYear: 2029 });
    expect(parseTerm("Snow clearing, six (6) winter seasons", "2026-06-01")).toMatchObject({ source: "stated-seasons", seasons: 6, months: 72 });
    expect(parseTerm("Winter maintenance 36 months", "2026-06-01")).toMatchObject({ source: "stated-duration", months: 36 });
    expect(parseTerm("Janitorial services 3+2", "2026-06-01")).toMatchObject({ source: "stated-duration", months: 36, optionMonths: 24 });
    expect(parseTerm("Grounds maintenance, three (3) year term plus two (2) option years", "2026-06-01")).toMatchObject({ source: "stated-duration", months: 36, optionMonths: 24 });
    expect(parseTerm("Entretien ménager - 2 ans avec deux (2) années d'option", "2026-06-01")).toMatchObject({ months: 24, optionMonths: 24 });
  });

  it("does not mistake reference numbers for periods, and labels the fallback", () => {
    expect(parseTerm("AVRCE RFP 2026-03 Fire Protection Services", "2026-04-21").source).toBe("typical");
    expect(parseTerm("Snow removal 2019-2022", "2026-04-21").source).toBe("typical"); // not this award's period
    const typical = parseTerm("Janitorial Services – Perennia Innovation Park", "2026-08-07");
    expect(typical).toMatchObject({ source: "typical", months: 36, optionMonths: null });
    const t = intelMessages.en;
    expect(t.renewals.how.typical).toBe("Estimated from typical 3-year terms");
  });

  it("expects the rebid in the same month as the award, one term later, with the window opening before it", () => {
    const a = intelAwards([award({ title: "Snow clearing 2026-2029", date: "2026-07-06" }), award({ title: "Janitorial 3+2", date: "2025-11-01", trades: ["Cleaning / Janitorial"] })]);
    const snow = renewalFor(a.find((x) => x.title.startsWith("Snow"))!, TODAY)!;
    expect(snow.expectedRebid).toBe("2029-07-06");
    expect(snow.windowStart).toBe(addMonths("2029-07-06", -RETENDER_LEAD_MONTHS));
    expect(snow.status).toBe("later");
    const jan = renewalFor(a.find((x) => x.title.startsWith("Janitorial"))!, TODAY)!;
    expect(jan.expectedRebid).toBe("2028-11-01");
    expect(jan.windowEnd).toBe("2030-11-01"); // option years keep it open
    expect(rebidMonths([snow, jan])).toEqual([{ month: 7, items: 1 }, { month: 11, items: 1 }]);
  });

  it("only recurring service trades, filters by trade/province/buyer/horizon, one country at a time", () => {
    const rows = intelAwards([
      award({ title: "Snow clearing 2025-2026", date: "2025-12-01" }), // rebid ~Dec 2026: due soon
      award({ title: "Boiler replacement", trades: ["HVAC"], date: "2025-12-01" }), // project, not maintenance
      award({ title: "HVAC preventive maintenance", trades: ["HVAC"], date: "2024-01-15" }), // typical 3y → Jan 2027
      award({ title: "Snow clearing", province: "TX", currency: "USD", buyer: "City of Austin", date: "2024-02-01" }),
      award({ title: "Snow clearing 2020", date: "2020-01-01" }), // older than 5 years
    ]);
    const ca12 = renewalRadar(rows, { country: "CA", today: TODAY, horizon: 12 });
    expect(ca12.map((r) => r.award.title)).toEqual(["Snow clearing 2025-2026", "HVAC preventive maintenance"]);
    expect(ca12[0].status).toBe("due");
    expect(renewalRadar(rows, { country: "CA", today: TODAY, horizon: 12, trade: "hvac" })).toHaveLength(1);
    expect(renewalRadar(rows, { country: "CA", today: TODAY, horizon: 12, province: "Ontario" })).toHaveLength(0);
    expect(renewalRadar(rows, { country: "CA", today: TODAY, horizon: 12, buyer: "city of halifax" })).toHaveLength(2);
    const us = renewalRadar(rows, { country: "US", today: TODAY, horizon: "all" });
    expect(us.map((r) => r.award.country)).toEqual(["US"]);
    expect(us[0].award.currency).toBe("USD");
    expect(termStatedShare(rows, "CA")).toMatchObject({ awards: 4, stated: 1 });
  });
});

describe("coverage numbers", () => {
  it("counts companies and buyers with 3+ awards per country", () => {
    const a = awards();
    const c = intelCoverage(a, buyerRefs(a), "CA", TODAY);
    expect(c).toMatchObject({ country: "CA", awards: 7, companies3: 1, buyers3: 1, historyFrom: "2025-11-20" });
    expect(intelCoverage(a, buyerRefs(a), "US", TODAY)).toMatchObject({ awards: 1, companies3: 0 });
  });
});

/* ------------------------------------------------------------------ gating */

const ctx = (intel: boolean): IntelCtx => ({
  lang: "en",
  t: intelMessages.en,
  cta: { signedIn: true, hasOrg: true, intel, country: "CA", monthly: { price: "$99 CAD", payable: true }, annual: { price: "$990 CAD", payable: true }, launch: true, next: "/intel" },
});

describe("no gated data in a non-subscriber's HTML", () => {
  const a = awards();
  const slug = a.find((x) => x.winner?.startsWith("Northline"))!.winnerSlug!;
  const profile = companyProfile(a, slug, "CA", TODAY)!;
  const strip = (h: string) => h.replace(/<[^>]+>/g, " ");

  it("company profile: counts + one example award; no totals, averages, buyer list or other awards", () => {
    const free = renderToStaticMarkup(<CompanyBody view={intelView(profile, false, companyTeaser)} ctx={ctx(false)} csvHref="/csv" />);
    expect(free).toContain(intelMessages.en.teaser.title);
    expect(free).toContain("$100,000 CAD"); // the one example row (a public notice)
    for (const secret of ["$150", "$75", "Province of Nova Scotia", "$50,000", "/csv"]) expect(strip(free) + free).not.toContain(secret);
    expect(free).toContain("in-blur");
    const full = renderToStaticMarkup(<CompanyBody view={intelView(profile, true, companyTeaser)} ctx={ctx(true)} csvHref="/csv" />);
    for (const shown of ["$150K CAD", "$75K CAD", "Province of Nova Scotia", "$50,000 CAD", "/csv"]) expect(full).toContain(shown);
  });

  it("buyer, market and renewal teasers carry no values, shares or windows beyond the example", () => {
    const refs = buyerRefs(a);
    const bp = buyerProfile(a, refs.find((r) => r.name === "City of Halifax")!);
    const bFree = renderToStaticMarkup(<BuyerBody view={intelView(bp, false, buyerTeaser)} ctx={ctx(false)} csvHref="/csv" />);
    for (const secret of ["Northline Snow", "$559", "Incumbents", "/csv"]) expect(bFree).not.toContain(secret);
    expect(renderToStaticMarkup(<BuyerBody view={intelView(bp, true, buyerTeaser)} ctx={ctx(true)} csvHref="/csv" />)).toContain("Northline Snow Services Ltd");

    const many = intelAwards(Array.from({ length: 6 }, (_, i) => award({ winner: i < 4 ? "Big Plow Ltd" : "Small Plow Ltd", amount: 90_000 - i, date: `2026-0${i + 1}-02` })));
    const m = marketShare(many, "snow-removal", "Nova Scotia", TODAY)!;
    const mFree = renderToStaticMarkup(<MarketBody view={intelView(m, false, (x) => marketTeaser(x, many[0]))} ctx={ctx(false)} csvHref="/csv" />);
    for (const secret of ["66.7%", "Herfindahl", "Big Plow", "Concentrated", "concentrated"]) expect(mFree).not.toContain(secret);
    expect(renderToStaticMarkup(<MarketBody view={intelView(m, true, (x) => marketTeaser(x, many[0]))} ctx={ctx(true)} csvHref="/csv" />)).toContain("66.7%");

    const radarRows = intelAwards([award({ title: "Snow clearing 2025-2026", date: "2025-12-01", winner: "First Plow Ltd" }), award({ title: "HVAC maintenance", trades: ["HVAC"], date: "2024-01-15", winner: "Secret Air Ltd" })]);
    const items = renewalRadar(radarRows, { country: "CA", today: TODAY, horizon: 12 });
    const rFree = renderToStaticMarkup(<RenewalsBody view={intelView(items, false, (x) => renewalTeaser("CA", x, []))} ctx={ctx(false)} csvHref="/csv" />);
    expect(rFree).toContain("First Plow Ltd");
    expect(rFree).not.toContain("Secret Air");
    expect(rFree).not.toContain("/csv");
    expect(renderToStaticMarkup(<RenewalsBody view={intelView(items, true, (x) => renewalTeaser("CA", x, []))} ctx={ctx(true)} csvHref="/csv" />)).toContain("Secret Air Ltd");
  });

  it("the teaser objects themselves hold only counts and one example", () => {
    const tz = companyTeaser(profile);
    expect(Object.keys(tz).sort()).toEqual(["awards", "buyers", "country", "example", "name", "otherCountryAwards", "provinces", "publicPage", "slug", "trades"]);
    expect(JSON.stringify(tz)).not.toContain("150000");
  });
});

/* ------------------------------------------------------------------ entitlement + Stripe */

describe("the intel entitlement", () => {
  it("is separate from Trade Pro: active/comped/trialing rows, end dates, admins, suspended orgs", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(isIntelRowActive({ status: "active" }, now)).toBe(true);
    expect(isIntelRowActive({ status: "comped", expires_at: "2026-12-31T00:00:00Z" }, now)).toBe(true);
    expect(isIntelRowActive({ status: "comped", expires_at: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(isIntelRowActive({ status: "past_due" }, now)).toBe(false);
    expect(isIntelRowActive(null, now)).toBe(false);
    expect(intelEntitled({ admin: true, row: null })).toBe(true);
    expect(intelEntitled({ admin: false, organizationStatus: "suspended", row: { status: "active" } })).toBe(false);
    expect(intelStatusFromStripe("incomplete")).toBe("inactive");
  });

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
  };

  it("loadSessionContext (the central helper) sets hasIntelAccess independently of Trade Pro", async () => {
    const paidPro = await loadSessionContext(sessionClient({ ...base, subscriptions: { data: { status: "active", tier: "pro" } } }));
    expect(paidPro).toMatchObject({ hasTradeAccess: true, hasIntelAccess: false });
    const intelOnly = await loadSessionContext(sessionClient({ ...base, subscriptions: { data: null }, intel_access: { data: { status: "comped", expires_at: null } } }));
    expect(intelOnly).toMatchObject({ hasTradeAccess: false, hasIntelAccess: true });
    const missing = await loadSessionContext(sessionClient({ ...base, intel_access: { data: null, error: { code: "42P01", message: "relation does not exist" } } }));
    expect(missing?.hasIntelAccess).toBe(false);
    const admin = await loadSessionContext(sessionClient({ ...base, users_profile: { data: { id: "u1", primary_role: "admin", status: "active" } } }));
    expect(admin?.hasIntelAccess).toBe(true);
  });

  it("maps a Stripe subscription to an intel_access row and never lets Stripe switch off an admin grant", () => {
    const sub = {
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      cancel_at_period_end: false,
      metadata: { organization_id: "org1", product: "pmrfp_award_intel" },
      items: { data: [{ current_period_end: 1_800_000_000, price: { id: "price_m_cad", currency: "cad", unit_amount: 9900, recurring: { interval: "month" } } }] },
    } as unknown as Stripe.Subscription;
    expect(intelRowFromSubscription(sub, new Date("2026-10-16T00:00:00Z"))).toMatchObject({
      organization_id: "org1", status: "active", source: "stripe", billing_interval: "monthly", currency: "CAD", amount: 99, stripe_subscription_id: "sub_1",
    });
    expect(intelRowFromSubscription({ ...sub, metadata: {} } as unknown as Stripe.Subscription)).toBeNull();
    const grant = { status: "comped", source: "admin", stripe_subscription_id: null };
    expect(shouldApplyIntelSync(grant, { status: "canceled", stripe_subscription_id: "sub_1" })).toBe(false);
    expect(shouldApplyIntelSync(grant, { status: "active", stripe_subscription_id: "sub_1" })).toBe(true);
    expect(shouldApplyIntelSync({ status: "active", source: "stripe", stripe_subscription_id: "sub_1" }, { status: "canceled", stripe_subscription_id: "sub_1" })).toBe(true);
  });
});

describe("Intel pricing config", () => {
  const env = {
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_PRICE_INTEL_MONTHLY_CAD: "price_m_cad",
    STRIPE_PRICE_INTEL_ANNUAL_USD: "price_a_usd",
    STRIPE_PRICE_INTEL_MONTHLY_USD: "not-a-price",
  };
  it("one currency per country, launch prices, env price IDs, checkout off by default", () => {
    expect(INTEL_PRICES).toEqual({ monthly: { CAD: 99, USD: 99 }, annual: { CAD: 990, USD: 990 } });
    expect(intelPrice("annual", "US")).toEqual({ amount: 990, currency: "USD" });
    expect(intelPrice("monthly", "CA")).toEqual({ amount: 99, currency: "CAD" });
    expect(intelStripePrice("monthly", "CA", env)).toBe("price_m_cad");
    expect(intelStripePrice("monthly", "US", env)).toBeNull();
    expect(intelStripePrice("annual", "CA", env)).toBeNull();
    expect(intelPriceInfo("price_a_usd", env)).toEqual({ interval: "annual", currency: "USD" });
    expect(intelCheckoutEnabled(env)).toBe(false);
    expect(intelPayable("monthly", "CA", env)).toBe(false);
    expect(intelPayable("monthly", "CA", { ...env, INTEL_CHECKOUT_ENABLED: "true" })).toBe(true);
  });
});

describe("CSV exports", () => {
  it("BOM, one currency named in the header, escaping, formula-safe cells, individuals not named", () => {
    const a = awards();
    const slug = a.find((x) => x.winner?.startsWith("Northline"))!.winnerSlug!;
    const csv = companyCsv(companyProfile(a, slug, "CA", TODAY)!, "https://pmrfp.com");
    expect(csv.startsWith("﻿award_date,")).toBe(true);
    expect(csv).toContain("value_cad");
    expect(csv).not.toContain("USD");
    expect(csv.trim().split("\n")).toHaveLength(4);
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    const m = marketCsv(marketShare(a, "snow-removal", "Nova Scotia", TODAY)!, "https://pmrfp.com");
    expect(m).toContain("Individual (not named)");
    expect(m).not.toContain("Alain Roy");
    const r = renewalsCsv(renewalRadar(intelAwards([award({ title: "Snow clearing 2025-2026", date: "2025-12-01" })]), { country: "CA", today: TODAY, horizon: "all" }), "https://pmrfp.com");
    expect(r.split("\n")[0]).toContain("how_estimated");
    expect(r).toContain("Period stated in the notice");
  });
});
