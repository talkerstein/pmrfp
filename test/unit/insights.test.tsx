import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { renderToStaticMarkup } from "react-dom/server";
import type { RfpListItem } from "@/lib/data/types";
import { intelAwards, buyerRefs } from "@/lib/intel/model";
import { benchmarkAwards } from "@/lib/data/price-benchmarks";
import {
  detectBuyerSurge,
  detectCompetitorWins,
  detectGcNamed,
  detectIncumbentStreaks,
  detectNewProjects,
  detectPriceBand,
  detectPriceMove,
  detectRenewals,
  detectSeasonality,
  detectVolume,
  isoWeekKey,
  lastCompleteWeek,
  runDetectors,
  type InsightData,
  type LeadLike,
} from "@/lib/insights/detectors";
import { headlineOf, insightsFor, rankFacts } from "@/lib/insights/engine";
import { entitlementsOf, lockFact, viewFacts } from "@/lib/insights/gating";
import { gapText, renderFact, renderLocked, renderView, templateFor } from "@/lib/insights/copy";
import { numberTokens, validatePolished } from "@/lib/insights/validator";
import { insightsLlmEnabled, polishInsights } from "@/lib/insights/writer";
import { briefSkipReason, insightsEmailEnabled, leadAlertDeferredToBrief, mergesLeads, renderBrief } from "@/lib/insights/email";
import { indexableMarkets, lastCompleteMonth, marketMonth, MIN_INDEX_RECORDS } from "@/lib/insights/market";
import { positioningFor, positioningView } from "@/lib/insights/positioning";
import { scopeFromProfile } from "@/lib/insights/scope";
import { InsightsCard } from "@/components/insights/insights-card";
import { BidPositioningCard } from "@/components/insights/bid-positioning-card";
import type { InsightFact, InsightGap, TradeRef } from "@/lib/insights/types";

const TODAY = "2026-10-16"; // a Friday; last complete week = Oct 5–11, the one before = Sep 28–Oct 4
const SNOW: TradeRef = { slug: "snow-removal", name: "Snow Removal" };
const PAINT: TradeRef = { slug: "painting", name: "Painting" };
const HVAC: TradeRef = { slug: "hvac", name: "HVAC" };
const isGap = (x: unknown): x is InsightGap => typeof x === "object" && x !== null && !("id" in x);

let seq = 0;
/** An open public tender. marker: "tor" (City of Toronto), "qc" (SEAO), "us" handled via province. */
function tender(o: { trade?: string; province?: string; published: string; created?: string; marker?: "tor" | "qc"; buyer?: string }): RfpListItem {
  const i = ++seq;
  const marker = o.marker ?? "tor";
  return {
    slug: `t-${i}-${marker}-r${i}`,
    title: `Tender ${i}`,
    summary: `Public tender from ${o.buyer ?? "City of Toronto"}, posted ${o.published}.`,
    categories: [o.trade ?? "Painting"],
    regionName: null,
    propertyTypeName: null,
    city: null,
    province: o.province ?? "Ontario",
    deadline: "2026-12-01",
    isDemo: false,
    photoUrls: [],
    status: "open",
    sourceType: "public_source",
    publishedAt: `${o.published}T00:00:00Z`,
    createdAt: `${o.created ?? "2026-06-01"}T00:00:00Z`,
  };
}

/** A past public contract. marker "cba" = CanadaBuys awards (365 days kept), "qca" = SEAO (180 days). */
function award(o: { trade?: string; province?: string; date: string; winner?: string; amount?: number | null; buyer?: string; marker?: "cba" | "qca" | "tora"; title?: string; currency?: "CAD" | "USD" }): RfpListItem {
  const i = ++seq;
  const { amount = 50_000, currency = "CAD" } = o;
  const value = amount === null ? "value not disclosed" : `$${amount.toLocaleString("en-US")} ${currency}`;
  return {
    slug: `a-${i}-${o.marker ?? "cba"}-w${i}`,
    title: o.title ?? `Contract ${i}`,
    summary: `Awarded ${o.date} to ${o.winner ?? "Northline Services Ltd"} (Town) — ${value}. Past public contract issued by ${o.buyer ?? "City of Halifax"}.`,
    categories: [o.trade ?? "Snow Removal"],
    regionName: null,
    propertyTypeName: null,
    city: null,
    province: o.province ?? "Nova Scotia",
    deadline: o.date,
    isDemo: false,
    photoUrls: [],
    status: "closed",
    sourceType: "public_source",
    publishedAt: `${o.date}T00:00:00Z`,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function dataOf(rfps: RfpListItem[], leads: LeadLike[] | null = null): InsightData {
  const awards = intelAwards(rfps);
  return { today: TODAY, rfps, awards, refs: buyerRefs(awards), benchmarkAwards: benchmarkAwards(rfps), leads };
}

const days = (from: string, n: number) => Array.from({ length: n }, (_, k) => new Date(Date.parse(`${from}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10));

/* ------------------------------------------------------------------ dates */

describe("insight dates", () => {
  it("uses the last complete Monday–Sunday week, stable all week", () => {
    expect(lastCompleteWeek("2026-10-16")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(lastCompleteWeek("2026-10-12")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(lastCompleteWeek("2026-10-18")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(lastCompleteWeek("2026-10-19")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });
  it("ISO week keys (one brief per week)", () => {
    expect(isoWeekKey("2026-10-12")).toBe("2026-W42");
    expect(isoWeekKey("2026-10-18")).toBe("2026-W42");
    expect(isoWeekKey("2026-10-19")).toBe("2026-W43");
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01");
  });
  it("last complete month", () => {
    expect(lastCompleteMonth("2026-10-16")).toBe("2026-09");
    expect(lastCompleteMonth("2026-01-05")).toBe("2025-12");
  });
});

/* ------------------------------------------------------------------ volume */

describe("detectVolume", () => {
  const week = [...days("2026-10-05", 7), ...days("2026-10-05", 3)]; // 10 this week
  const prev = days("2026-09-28", 4); // 4 the week before
  it("week over week from feeds read long enough; says when last year isn't on record", () => {
    const rfps = [...week.map((d) => tender({ published: d })), ...prev.map((d) => tender({ published: d }))];
    const f = detectVolume(dataOf(rfps), "CA", "Ontario", PAINT);
    expect(isGap(f)).toBe(false);
    if (isGap(f)) return;
    expect(f.data).toMatchObject({ current: 10, previous: 4, changePct: 150, direction: "up", excludedSources: 0 });
    expect(f.data.lastYear.status).toBe("no-history");
    expect(f.tier).toBe("free");
    expect(renderFact(f, "en").text).toContain("Not enough history yet to compare with last year.");
  });
  it("a feed PMRFP only started reading inside the window is not a trend", () => {
    const rfps = [...week.map((d) => tender({ published: d, created: "2026-10-01" })), ...prev.map((d) => tender({ published: d, created: "2026-10-01" }))];
    const g = detectVolume(dataOf(rfps), "CA", "Ontario", PAINT);
    expect(isGap(g) && g.reason).toBe("short-history");
  });
  it("too few listings: a gap, not a percentage", () => {
    const g = detectVolume(dataOf([tender({ published: "2026-10-06" }), tender({ published: "2026-09-29" })]), "CA", "Ontario", PAINT);
    expect(isGap(g) && g.reason).toBe("too-few");
  });
  it("compares with the same week last year when the feed reaches back", () => {
    const ly = days("2025-10-06", 4).map((d) => tender({ published: d, created: "2025-01-01" }));
    const rfps = [...week.map((d) => tender({ published: d, created: "2025-01-01" })), ...prev.map((d) => tender({ published: d, created: "2025-01-01" })), ...ly];
    const f = detectVolume(dataOf(rfps), "CA", "Ontario", PAINT);
    expect(!isGap(f) && f.data.lastYear).toEqual({ status: "ok", count: 4, changePct: 150 });
  });
  it("small moves are 'about the same'", () => {
    const rfps = [...days("2026-10-05", 5).map((d) => tender({ published: d })), ...days("2026-09-28", 4).map((d) => tender({ published: d }))];
    const f = detectVolume(dataOf(rfps), "CA", "Ontario", PAINT);
    expect(!isGap(f) && f.data.direction).toBe("steady");
  });
  it("country first: U.S. listings never count for a Canadian scope", () => {
    const rfps = [...week.map((d) => tender({ published: d, province: "Texas" })), ...prev.map((d) => tender({ published: d, province: "Texas" }))];
    expect(isGap(detectVolume(dataOf(rfps), "CA", null, PAINT))).toBe(true);
    const us = detectVolume(dataOf(rfps), "US", null, PAINT);
    expect(!isGap(us) && us.country).toBe("US");
  });
});

/* ------------------------------------------------------------------ seasonality */

describe("detectSeasonality", () => {
  // A full year of CanadaBuys awards (feed starts 2025-11-01), 16 of 20 in Jan–Mar.
  const year = [
    ...["2026-01-10", "2026-01-20", "2026-01-25", "2026-02-02", "2026-02-10", "2026-02-12", "2026-02-20", "2026-02-25", "2026-03-01", "2026-03-05", "2026-03-10", "2026-03-15", "2026-03-20", "2026-01-05", "2026-02-15", "2026-03-25"].map((d) =>
      award({ trade: "HVAC", province: "Ontario", date: d }),
    ),
    ...["2025-11-01", "2026-05-01", "2026-07-01", "2026-09-01"].map((d) => award({ trade: "HVAC", province: "Ontario", date: d })),
  ];
  it("finds the busy three months and counts what it leaves out", () => {
    const recentSeao = ["2026-08-01", "2026-09-01"].map((d) => award({ trade: "HVAC", province: "Ontario", date: d, marker: "qca" }));
    const f = detectSeasonality(dataOf([...year, ...recentSeao]), "CA", "Ontario", HVAC);
    expect(isGap(f)).toBe(false);
    if (isGap(f)) return;
    expect(f.data.peak).toMatchObject({ fromMonth: 1, toMonth: 3, n: 16, sharePct: 80 });
    expect(f.sample.n).toBe(20);
    expect(f.data.excluded).toBe(2);
    expect(renderFact(f, "en").text).toMatch(/80% of the 20 public hvac contracts awarded in Ontario.*January–March.*2 awards from sources with less than a year of records are left out\./i);
  });
  it("a source with under a year of records: short history, no season", () => {
    const seaoOnly = days("2026-06-01", 30).map((d) => award({ trade: "Snow Removal", province: "Quebec", date: d, marker: "qca" }));
    const g = detectSeasonality(dataOf(seaoOnly), "CA", "Quebec", SNOW);
    expect(isGap(g) && g.reason).toBe("short-history");
  });
  it("too few awards: a gap", () => {
    const g = detectSeasonality(dataOf([...year.slice(0, 4), year[16]]), "CA", "Ontario", HVAC);
    expect(isGap(g) && g.reason).toBe("too-few");
  });
});

/* ------------------------------------------------------------------ price */

describe("price detectors", () => {
  const vals = [40_000, 50_000, 60_000, 70_000, 80_000];
  it("price band needs 5 valued awards (benchmark rule)", () => {
    const rfps = vals.map((v, i) => award({ trade: "Painting", province: "Ontario", date: `2026-0${i + 3}-10`, amount: v }));
    const f = detectPriceBand(dataOf(rfps), "Ontario", PAINT);
    expect(!isGap(f) && f.data).toMatchObject({ n: 5, median: 60_000, currency: "CAD" });
    expect(!isGap(f) && f.tier).toBe("pro");
    const g = detectPriceBand(dataOf(rfps.slice(0, 4)), "Ontario", PAINT);
    expect(isGap(g) && g.reason).toBe("too-few");
  });
  it("price movement: recent median vs earlier, both sides 5+, feeds covering the whole period", () => {
    const earlier = vals.map((v, i) => award({ trade: "Painting", province: "Ontario", date: `2025-1${i % 3}-0${i + 1}`, amount: v }));
    const recent = vals.map((v, i) => award({ trade: "Painting", province: "Ontario", date: `2026-0${i + 5}-10`, amount: v * 2 }));
    const f = detectPriceMove(dataOf([...earlier, ...recent]), "Ontario", PAINT);
    expect(isGap(f)).toBe(false);
    if (isGap(f)) return;
    expect(f.data).toMatchObject({ recentMedian: 120_000, earlierMedian: 60_000, changePct: 100, direction: "up" });
    expect(f.tier).toBe("intel");
  });
  it("price movement: an earlier side missing from a newer feed is short history, not a trend", () => {
    const recentOnly = vals.map((v, i) => award({ trade: "Painting", province: "Ontario", date: `2026-0${i + 5}-10`, amount: v, marker: "qca" }));
    const g = detectPriceMove(dataOf(recentOnly), "Ontario", PAINT);
    expect(isGap(g)).toBe(true);
  });
});

/* ------------------------------------------------------------------ buyers */

describe("buyer detectors", () => {
  it("buyer posting more than its usual pace", () => {
    const history = ["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10"].map((d) => tender({ published: d, created: "2026-04-01", buyer: "City of Toronto" }));
    const burst = ["2026-09-20", "2026-09-25", "2026-10-01", "2026-10-05", "2026-10-10"].map((d) => tender({ published: d, created: "2026-04-01", buyer: "City of Toronto" }));
    const f = detectBuyerSurge(dataOf([...history, ...burst]), "CA", "Ontario", PAINT);
    expect(isGap(f)).toBe(false);
    if (isGap(f)) return;
    expect(f.data).toMatchObject({ buyer: "City of Toronto", recent: 5, recentDays: 30 });
    expect(f.data.usualPerMonth).toBeLessThan(1);
    expect(f.tier).toBe("intel");
  });
  it("no surge from a feed read for under 3 months", () => {
    const burst = ["2026-09-20", "2026-09-25", "2026-10-01", "2026-10-05", "2026-10-10"].map((d) => tender({ published: d, created: "2026-09-01" }));
    expect(isGap(detectBuyerSurge(dataOf(burst), "CA", "Ontario", PAINT))).toBe(true);
  });
  it("incumbent streak: the same company on the buyer's latest awards", () => {
    const rfps = [
      award({ date: "2026-03-01", winner: "Alpha Snow Ltd", buyer: "Town of Truro" }),
      award({ date: "2026-05-01", winner: "Bravo Plowing Inc", buyer: "Town of Truro" }),
      award({ date: "2026-06-01", winner: "Bravo Plowing Inc", buyer: "Town of Truro" }),
      award({ date: "2026-07-01", winner: "Bravo Plowing Inc", buyer: "Town of Truro" }),
      award({ date: "2026-07-02", winner: "Alpha Snow Ltd", buyer: "Town of Kentville" }),
    ];
    const [f] = detectIncumbentStreaks(dataOf(rfps), "CA", "Nova Scotia", SNOW);
    expect(f.data).toMatchObject({ buyer: "Town of Truro", winner: "Bravo Plowing Inc", streak: 3, buyerAwards: 4, lastDate: "2026-07-01" });
    expect(renderFact(f, "en").text).toContain("Bravo Plowing Inc won Town of Truro's last 3 snow removal awards on record");
  });
});

/* ------------------------------------------------------------------ projects, GCs, renewals, wins */

describe("projects, GCs, renewals, wins", () => {
  const lead = (o: Partial<LeadLike>): LeadLike => ({ key: `mp:${++seq}`, kind: "project", title: "Hospital wing", city: "Toronto", province: "Ontario", seen: "2026-10-07", valueCad: 12_000_000, href: "/major-projects/x", hasContractor: false, score: 50, ...o });
  it("new projects in the last complete week, with a gap when there are none", () => {
    const f = detectNewProjects(dataOf([], [lead({}), lead({ kind: "permit", hasContractor: true }), lead({ seen: "2026-09-01" })]), "CA", [PAINT]);
    expect(!isGap(f) && f.data).toMatchObject({ count: 2, projects: 1, permits: 1, withGc: 1 });
    expect(isGap(detectNewProjects(dataOf([], []), "CA", [PAINT]))).toBe(true);
  });
  it("general contractors who just won building work nearby", () => {
    const f = detectGcNamed(dataOf([award({ trade: "General Contracting", province: "Ontario", date: "2026-10-01", winner: "Brawn Construction Ltd", amount: 3_000_000 })]), "CA", "Ontario");
    expect(!isGap(f) && f.data.items[0]).toMatchObject({ winner: "Brawn Construction Ltd", amount: 3_000_000 });
    expect(isGap(detectGcNamed(dataOf([award({ trade: "General Contracting", province: "Ontario", date: "2026-07-01" })]), "CA", "Ontario"))).toBe(true);
  });
  it("renewals from the radar say how many terms were stated", () => {
    const f = detectRenewals(dataOf([award({ date: "2024-01-15", title: "Snow clearing 3 years" }), award({ date: "2023-12-20", title: "Snow clearing" })]), "CA", "Nova Scotia", SNOW);
    expect(isGap(f)).toBe(false);
    if (isGap(f)) return;
    expect(f.data.count).toBeGreaterThanOrEqual(1);
    expect(f.data.typicalTermYears).toBe(3);
    expect(renderFact(f, "en").text).toMatch(/likely up for rebid/);
  });
  it("recent wins need 2+ awards", () => {
    const rfps = [award({ date: "2026-10-01", winner: "Alpha Snow Ltd", amount: 10_000 }), award({ date: "2026-10-02", winner: "Alpha Snow Ltd", amount: 20_000 })];
    const f = detectCompetitorWins(dataOf(rfps), "CA", "Nova Scotia", SNOW);
    expect(!isGap(f) && f.data).toMatchObject({ count: 2, total: 30_000, winners: [{ name: "Alpha Snow Ltd", wins: 2, value: 30_000 }] });
    expect(isGap(detectCompetitorWins(dataOf(rfps.slice(0, 1)), "CA", "Nova Scotia", SNOW))).toBe(true);
  });
});

/* ------------------------------------------------------------------ engine & country */

describe("engine", () => {
  const rfps = [
    ...[40_000, 50_000, 60_000, 70_000, 80_000].map((v, i) => award({ province: "Nova Scotia", date: `2026-0${i + 4}-10`, amount: v, winner: "Bravo Plowing Inc", buyer: "Town of Truro" })),
    award({ date: "2026-10-01", winner: "Alpha Snow Ltd" }),
    award({ date: "2026-10-03", winner: "Alpha Snow Ltd" }),
    // U.S. awards in USD must never show up for a Canadian member.
    ...[1, 2, 3, 4, 5].map((i) => award({ province: "Texas", date: `2026-0${i + 3}-10`, amount: 99_999, winner: "Lone Star Snow LLC", currency: "USD", buyer: "City of Austin" })),
  ];
  it("ranks by persona and is deterministic", () => {
    const scope = { country: "CA" as const, provinces: ["Nova Scotia"], trades: [SNOW] };
    const a = insightsFor(dataOf(rfps), scope, "recurring");
    const b = insightsFor(dataOf(rfps), scope, "recurring");
    expect(a.ranked.map((f) => f.id)).toEqual(b.ranked.map((f) => f.id));
    expect(a.ranked.length).toBeGreaterThan(0);
    const json = JSON.stringify(a.ranked);
    expect(json).not.toContain("Lone Star");
    expect(json).not.toContain("USD");
    expect(a.ranked.every((f) => f.country === "CA")).toBe(true);
  });
  it("subtrades rank projects first, recurring ranks renewals/incumbents first", () => {
    const facts = runDetectors(dataOf(rfps, [{ key: "mp:1", kind: "project", title: "Arena", city: "Halifax", province: "Nova Scotia", seen: "2026-10-07", valueCad: 5_000_000, href: "/major-projects/arena", hasContractor: false, score: 60 }]), {
      country: "CA",
      provinces: ["Nova Scotia"],
      trades: [SNOW],
    }).facts;
    expect(rankFacts(facts, "subtrade")[0].kind).toBe("new_projects");
    expect(["renewals", "incumbent_streak", "seasonality", "price_band"]).toContain(rankFacts(facts, "recurring")[0].kind);
    expect(headlineOf(rankFacts(facts, "subtrade"))?.tier).toBe("free");
  });
  it("scope keeps the member's own country only", () => {
    const s = scopeFromProfile({ country: "CA", provinces: new Set(["Ontario", "Texas", "ON"]), tradeSlugs: new Set(["painting"]), nameBySlug: new Map([["painting", "Painting"]]) }, "Quebec");
    expect(s.provinces).toEqual(["Quebec", "Ontario"]);
    expect(s.trades).toEqual([PAINT]);
  });
});

/* ------------------------------------------------------------------ templates */

const sampleFacts = (): InsightFact[] => {
  const base = { personas: ["recurring"] as const, country: "CA" as const, region: "Quebec", trade: SNOW, from: "2025-10-20", to: "2026-10-11", sample: { n: 12, min: 5 }, confidence: "medium" as const, score: 50, links: [] };
  return [
    { ...base, id: "v", kind: "volume", tier: "free", data: { current: 12, previous: 8, changePct: 50, direction: "up", prevFrom: "2026-09-28", prevTo: "2026-10-04", lastYear: { status: "no-history", historyFrom: "2026-09-23" }, excludedSources: 1 } },
    { ...base, id: "s", kind: "seasonality", tier: "free", data: { months: [], peak: { fromMonth: 5, toMonth: 7, n: 30, sharePct: 62 }, span: 3, historyFrom: "2025-10-20", excluded: 0 } },
    { ...base, id: "pb", kind: "price_band", tier: "pro", data: { n: 86, p25: 88_558, median: 210_601, p75: 513_032, currency: "CAD" } },
    { ...base, id: "pm", kind: "price_move", tier: "intel", data: { recentMedian: 240_000, earlierMedian: 200_000, recentN: 9, earlierN: 14, changePct: 20, direction: "up", splitDate: "2026-04-16", currency: "CAD" } },
    { ...base, id: "bs", kind: "buyer_surge", tier: "intel", data: { buyer: "Ville de Laval", recent: 6, recentDays: 30, usualPerMonth: 1.5, months: 5 } },
    { ...base, id: "is", kind: "incumbent_streak", tier: "intel", data: { buyer: "Ville de Laval", buyerSlug: "ville-de-laval", winner: "Déneigement Martin inc.", winnerSlug: "deneigement-martin", streak: 3, buyerAwards: 5, lastDate: "2026-08-14" } },
    { ...base, id: "np", kind: "new_projects", tier: "free", data: { count: 3, projects: 2, permits: 1, applications: 0, withGc: 1, items: [{ name: "Arena", href: "/major-projects/arena", kind: "project", city: "Laval", valueCad: 40_000_000, date: "2026-10-07" }] } },
    { ...base, id: "gc", kind: "gc_named", tier: "pro", trade: null, data: { count: 4, items: [{ winner: "TISSEUR INC.", title: "Hospital", href: "/rfps/h", amount: 87_915_000, date: "2026-09-22" }], currency: "CAD", days: 30 } },
    { ...base, id: "rn", kind: "renewals", tier: "pro", data: { count: 4, horizonMonths: 12, soonest: "2027-01-15", stated: 1, typicalTermYears: 3, items: [{ title: "Snow lot 3", href: "/rfps/s3", buyer: "Ville de Laval", incumbent: "Déneigement Martin inc.", windowStart: "2027-01-15", expectedRebid: "2027-05-15", stated: false }] } },
    { ...base, id: "cw", kind: "competitor_wins", tier: "pro", data: { count: 33, valued: 30, total: 15_389_492, days: 30, currency: "CAD", winners: [{ name: "2991209 CANADA INC.", slug: "x", wins: 2, value: 3_839_634 }] } },
  ] as InsightFact[];
};

describe("templates (en / fr / es)", () => {
  it("every kind renders in all three languages from the record only", () => {
    for (const f of sampleFacts()) {
      const en = renderFact(f, "en");
      const fr = renderFact(f, "fr");
      const es = renderFact(f, "es");
      for (const r of [en, fr, es]) {
        expect(r.title.length).toBeGreaterThan(5);
        expect(r.text.length).toBeGreaterThan(20);
      }
      expect(fr.text).not.toEqual(en.text);
      expect(es.text).not.toEqual(en.text);
    }
  });
  it("formats numbers and money per language", () => {
    const pb = sampleFacts().find((f) => f.kind === "price_band")!;
    expect(renderFact(pb, "en").text).toContain("$88,558 CAD");
    expect(renderFact(pb, "fr").text).toMatch(/88\s558\s\$\sCAD/);
    expect(renderFact(pb, "fr").text).toContain("au Québec");
    expect(renderFact(pb, "es").text).toContain("en Quebec");
  });
  it("singular forms", () => {
    const rn = sampleFacts().find((f) => f.kind === "renewals")! as Extract<InsightFact, { kind: "renewals" }>;
    const one = { ...rn, data: { ...rn.data, count: 1, stated: 1 } };
    expect(renderFact(one, "en").text).toMatch(/^1 snow removal contract in Quebec is likely up for rebid.*1 states its term/);
    expect(renderFact(one, "fr").text).toMatch(/^1 contrat de la catégorie Déneigement au Québec devrait/);
    expect(renderFact(one, "es").text).toMatch(/^1 contrato de la categoría Remoción de nieve en Quebec probablemente vuelva/);
  });
  it("no advice or prediction words in any template", () => {
    for (const f of sampleFacts()) for (const l of ["en", "fr", "es"] as const) {
      const t = templateFor(f, l).text;
      expect(t).not.toMatch(/you should|we recommend|vous devriez|deber[íi]a|will (rise|fall)|pr[ée]vision/i);
      // Each template passes its own validator (so a no-op polish is always accepted).
      expect(validatePolished(t, t, f).ok).toBe(true);
    }
  });
  it("gap lines say 'not enough history' in each language", () => {
    const g: InsightGap = { kind: "seasonality", country: "CA", region: "Quebec", trade: SNOW, reason: "short-history", sample: { n: 0, min: 15 } };
    expect(gapText(g, "en")).toMatch(/^Not enough history yet in Quebec/);
    expect(gapText(g, "fr")).toMatch(/^Pas encore assez d'historique au Québec/);
    expect(gapText(g, "es")).toMatch(/^Todavía no hay suficiente historial en Quebec/);
  });
});

/* ------------------------------------------------------------------ validator */

describe("validator", () => {
  const pb = sampleFacts().find((f) => f.kind === "price_band")!;
  const template = templateFor(pb, "en").text;
  it("accepts a rewording that keeps every number and name", () => {
    const ok = "Across the last 24 months, the middle half of 86 snow removal contracts awarded in Quebec ran from $88,558 CAD to $513,032 CAD, with a median of $210,601 CAD.";
    expect(validatePolished(template, ok, pb)).toEqual({ ok: true, reasons: [] });
  });
  it("rejects a hallucinated number", () => {
    const bad = template.replace("$210,601", "$215,000");
    const v = validatePolished(template, bad, pb);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/new numbers: 215000/);
    expect(v.reasons.join(" ")).toMatch(/dropped numbers: 210601/);
  });
  it("rejects an invented company, buyer or place", () => {
    const v = validatePolished(template, `${template} Most went to Groupe Excel Neige near Gatineau.`, pb);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/new names: .*Excel/);
  });
  it("rejects an all-caps name or a different currency", () => {
    expect(validatePolished(template, template.replace(/CAD/g, "USD"), pb).ok).toBe(false);
  });
  it("rejects a new month or date, including lower-case French months", () => {
    const s = sampleFacts().find((f) => f.kind === "seasonality")!;
    const fr = templateFor(s, "fr").text;
    const v = validatePolished(fr, fr.replace("juillet", "août"), s);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/new months: août/);
  });
  it("rejects advice and predictions in en / fr / es", () => {
    expect(validatePolished(template, `${template} You should bid around the median.`, pb).ok).toBe(false);
    expect(validatePolished(template, `${template} Prices will rise next year.`, pb).ok).toBe(false);
    const fr = templateFor(pb, "fr").text;
    expect(validatePolished(fr, `${fr} Vous devriez soumissionner près de la médiane.`, pb).ok).toBe(false);
    const es = templateFor(pb, "es").text;
    expect(validatePolished(es, `${es} Usted debería ofertar cerca de la mediana.`, pb).ok).toBe(false);
  });
  it("rejects links, markup and padding", () => {
    expect(validatePolished(template, `${template} See https://example.com`, pb).ok).toBe(false);
    expect(validatePolished(template, `**${template}**`, pb).ok).toBe(false);
    expect(validatePolished(template, `${template} ${"Very nice market overall. ".repeat(12)}`, pb).ok).toBe(false);
    expect(validatePolished(template, "   ", pb).ok).toBe(false);
  });
  it("normalizes number formats across languages", () => {
    expect(numberTokens("$88,558 CAD et 88 558 $ et 1,5 et 1.5 et 07")).toEqual(["88558", "88558", "1.5", "1.5", "7"]);
  });
});

describe("AI polish", () => {
  const facts = sampleFacts().filter((f) => f.kind === "price_band" || f.kind === "competitor_wins");
  const inputs = facts.map((f) => ({ fact: f, template: templateFor(f, "en").text }));
  it("is off by default and never calls the model", async () => {
    expect(insightsLlmEnabled(undefined)).toBe(false);
    const generate = vi.fn();
    const r = await polishInsights(inputs, "en", { enabled: false, generate });
    expect(r.skipped).toBe("off");
    expect(generate).not.toHaveBeenCalled();
    expect([...r.texts.values()]).toEqual(inputs.map((i) => i.template));
  });
  it("keeps validated rewrites and falls back to the template for hallucinations", async () => {
    const generate = vi.fn(async () =>
      JSON.stringify({
        items: [
          { id: "pb", text: "Across the last 24 months, the middle half of 86 snow removal contracts awarded in Quebec ran from $88,558 CAD to $513,032 CAD, with a median of $210,601 CAD." },
          { id: "cw", text: "33 snow removal contracts were awarded in Quebec in the last 30 days, worth $15,389,492 CAD in disclosed value (30 with a value), mostly to Groupe Fictif." },
        ],
      }),
    );
    const r = await polishInsights(inputs, "en", { enabled: true, generate });
    expect(r.polished).toBe(1);
    expect(r.texts.get("pb")).toMatch(/^Across the last 24 months/);
    expect(r.texts.get("cw")).toBe(inputs[1].template);
    expect(r.rejections).toHaveLength(1);
    expect(r.rejections[0]).toMatchObject({ factId: "cw", kind: "competitor_wins" });
    expect(r.rejections[0].reason).toMatch(/new names: .*Groupe/);
  });
  it("no AI client: templates", async () => {
    const r = await polishInsights(inputs, "en", { enabled: true, generate: null });
    expect(r.skipped).toBe("unavailable");
  });
});

/* ------------------------------------------------------------------ gating */

describe("gating", () => {
  const ranked = sampleFacts();
  it("free: one headline a week, everything else a teaser", () => {
    const v = viewFacts(ranked, { pro: false, intel: false });
    expect(v.filter((x) => !x.locked)).toHaveLength(1);
    expect(v.find((x) => !x.locked)!.locked === false && (v.find((x) => !x.locked) as { fact: InsightFact }).fact.tier).toBe("free");
  });
  it("Trade Pro: free + pro open, intel locked, Intel parts redacted", () => {
    const v = viewFacts(ranked, { pro: true, intel: false });
    const open = v.filter((x) => !x.locked) as { fact: InsightFact; intelRedacted: boolean }[];
    expect(open.map((x) => x.fact.tier).every((t) => t !== "intel")).toBe(true);
    const rn = open.find((x) => x.fact.kind === "renewals")!;
    expect(rn.intelRedacted).toBe(true);
    expect(rn.fact.kind === "renewals" && rn.fact.data.items).toEqual([]);
    const cw = open.find((x) => x.fact.kind === "competitor_wins")!;
    expect(cw.fact.kind === "competitor_wins" && cw.fact.data.winners).toEqual([]);
    expect(JSON.stringify(open)).not.toContain("Déneigement Martin");
  });
  it("Intel: everything", () => {
    expect(viewFacts(ranked, { pro: true, intel: true }).every((x) => !x.locked)).toBe(true);
  });
  it("Intel does not unlock Trade Pro, and the other way round", () => {
    const v = viewFacts(ranked, { pro: false, intel: true });
    expect(v.filter((x) => x.locked && x.stub.kind === "price_band")).toHaveLength(1);
    expect(v.filter((x) => !x.locked && x.fact.kind === "price_move")).toHaveLength(1);
    expect(entitlementsOf({ hasTradeAccess: true, hasIntelAccess: false })).toEqual({ pro: true, intel: false });
    expect(entitlementsOf(null)).toEqual({ pro: false, intel: false });
  });
  it("teasers carry whitelisted counts only: no gated numbers or names in the HTML", () => {
    const pb = ranked.find((f) => f.kind === "price_band")!;
    const stub = lockFact(pb, "pro");
    expect(stub.numbers).toEqual({ n: 86 });
    const views = viewFacts(ranked, { pro: false, intel: false });
    const html = renderToStaticMarkup(<InsightsCard insights={views.map((x) => renderView(x, "en"))} persona="recurring" lang="en" isPro={false} />);
    for (const secret of ["88,558", "210,601", "513,032", "Ville de Laval", "Déneigement Martin", "15,389,492", "TISSEUR", "240,000"]) expect(html).not.toContain(secret);
    expect(html).toContain("Trade Pro");
    expect(renderLocked(stub, "fr").text).toContain("86");
  });
  it("Pro card shows the band but not Intel detail", () => {
    const views = viewFacts(ranked, { pro: true, intel: false });
    const html = renderToStaticMarkup(<InsightsCard insights={views.map((x) => renderView(x, "en"))} persona="recurring" lang="en" isPro />);
    expect(html).toContain("$88,558 CAD");
    expect(html).not.toContain("Déneigement Martin");
    expect(html).not.toContain("240,000");
  });
});

describe("bid positioning", () => {
  const rfps = [
    ...[40_000, 50_000, 60_000, 70_000, 80_000].map((v, i) => award({ trade: "Painting", province: "Ontario", date: `2026-0${i + 3}-10`, amount: v, winner: i < 3 ? "Brushworks Painting Ltd" : "Other Painting Inc", buyer: "City of Toronto" })),
  ];
  const listing = { categories: ["Painting"], province: "Ontario", regionName: null, summary: "Public tender from City of Toronto, posted 2026-10-01." };
  const p = positioningFor(listing, { ...dataOf(rfps), tradeSlug: new Map([["Painting", "painting"]]) })!;
  it("finds the band and the buyer's usual winner", () => {
    expect(p.band).toMatchObject({ n: 5, median: 60_000 });
    expect(p.buyer).toMatchObject({ name: "City of Toronto", awards: 5, inTrade: 5 });
    expect(p.buyer!.incumbents[0]).toMatchObject({ name: "Brushworks Painting Ltd", wins: 3 });
  });
  it("free sees counts, Pro the band, Intel the winners; nothing gated in the HTML", () => {
    const free = positioningView(p, { pro: false, intel: false });
    expect(free.band).toBeNull();
    expect(free.incumbents).toBeNull();
    expect(free.locks).toEqual({ band: true, incumbents: true });
    const html = renderToStaticMarkup(<BidPositioningCard view={free} lang="en" upgradeHref="/x" />);
    expect(html).not.toContain("60,000");
    expect(html).not.toContain("Brushworks");
    expect(html).toContain("5 similar contracts on record");
    const pro = positioningView(p, { pro: true, intel: false });
    expect(pro.band?.median).toBe(60_000);
    expect(pro.incumbents).toBeNull();
    const intel = renderToStaticMarkup(<BidPositioningCard view={positioningView(p, { pro: true, intel: true })} lang="fr" upgradeHref="/x" />);
    expect(intel).toContain("Brushworks Painting Ltd");
    expect(intel).toMatch(/60\s000\s\$\sCAD/);
  });
});

/* ------------------------------------------------------------------ market pages */

describe("market pages", () => {
  it("recently-read feeds give 'not enough history', not zero", () => {
    const rfps = days("2026-09-02", 12).map((d) => tender({ trade: "Snow Removal", province: "Quebec", marker: "qc", published: d, created: "2026-09-23" }));
    const m = marketMonth(dataOf(rfps), SNOW, "Quebec");
    expect(m.month).toBe("2026-09");
    expect(m.tenders.month).toBeNull();
    expect(m.tenders.lastYear).toBeNull();
    expect(m.country).toBe("CA");
  });
  it("counts from feeds read long enough, and indexes only with enough records", () => {
    const rfps = [
      ...days("2026-09-02", 12).map((d) => tender({ trade: "Snow Removal", province: "Quebec", marker: "qc", published: d, created: "2026-05-01" })),
      ...days("2026-08-03", 4).map((d) => tender({ trade: "Snow Removal", province: "Quebec", marker: "qc", published: d, created: "2026-05-01" })),
    ];
    const m = marketMonth(dataOf(rfps), SNOW, "Quebec");
    expect(m.tenders).toMatchObject({ month: 12, prev: 4, lastYear: null });
    expect(m.indexable).toBe(m.records >= MIN_INDEX_RECORDS);
    expect(indexableMarkets(dataOf(rfps), "CA", [SNOW]).map((e) => e.province)).toEqual(["Quebec"]);
    expect(indexableMarkets(dataOf(rfps), "US", [SNOW])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ email */

describe("weekly brief email", () => {
  it("is off by default; weekly members get leads merged, daily members keep their alerts", () => {
    expect(insightsEmailEnabled(undefined)).toBe(false);
    expect(insightsEmailEnabled("1")).toBe(true);
    expect(mergesLeads("weekly")).toBe(true);
    expect(mergesLeads("daily")).toBe(false);
    expect(leadAlertDeferredToBrief("weekly", false)).toBe(false);
    expect(leadAlertDeferredToBrief("weekly", true)).toBe(true);
    expect(leadAlertDeferredToBrief("daily", true)).toBe(false);
    expect(leadAlertDeferredToBrief(null, true)).toBe(false);
  });
  it("one per week, respects opt-outs, never empty", () => {
    const base = { email: "a@b.co", cadence: "weekly" as const, sentThisWeek: false, insights: 2, leads: 0 };
    expect(briefSkipReason(base)).toBeNull();
    expect(briefSkipReason({ ...base, sentThisWeek: true })).toBe("already-sent");
    expect(briefSkipReason({ ...base, cadence: null })).toBe("opted-out");
    expect(briefSkipReason({ ...base, email: null })).toBe("no-email");
    expect(briefSkipReason({ ...base, insights: 0, leads: 0 })).toBe("empty");
    expect(briefSkipReason({ ...base, insights: 0, leads: 3 })).toBeNull();
  });
  it("renders with unsubscribe, sender and escaped text in each language", () => {
    const insights = sampleFacts().slice(0, 3).map((f) => renderFact(f, "fr"));
    const b = renderBrief({
      lang: "fr",
      tradeNames: ["Déneigement"],
      area: "Québec",
      insights: [...insights, { ...insights[0], id: "x", title: "<script>", text: "a & b" }],
      leads: [],
      base: "https://pmrfp.com",
      trial: true,
      unsubscribeUrl: "https://pmrfp.com/api/email/unsubscribe?u=1&t=2",
      mailingAddress: "5050 Dufferin St., Toronto",
      sender: "Talkerstein Consulting Group",
      contactEmail: "info@pmrfp.com",
    });
    expect(b.subject).toContain("Québec");
    expect(b.bodyHtml).toContain("https://pmrfp.com/fr/dashboard");
    expect(b.bodyHtml).toContain("&lt;script&gt;");
    expect(b.bodyHtml).not.toContain("<script>");
    expect(b.footnoteHtml).toContain("https://pmrfp.com/api/email/unsubscribe?u=1&amp;t=2");
    expect(b.footnoteHtml).toContain("Talkerstein Consulting Group");
    expect(b.footnoteHtml).toContain("essai");
    expect(b.text).toContain("Désactiver");
  });
});

describe("weekly brief cron with the flag off", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    process.env = { ...env };
    vi.doUnmock("@/lib/supabase/config");
    vi.doUnmock("@/lib/supabase/service");
    vi.doUnmock("@/lib/email/send");
  });
  it("sends nothing and touches nothing", async () => {
    delete process.env.INSIGHTS_EMAIL_ENABLED;
    const createServiceClient = vi.fn(() => {
      throw new Error("must not be called");
    });
    const sendInsightsBrief = vi.fn();
    vi.doMock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient }));
    vi.doMock("@/lib/email/send", () => ({ sendInsightsBrief, insightsBriefHtml: () => "" }));
    const { runInsightsBrief } = await import("@/lib/insights/server");
    const run = await runInsightsBrief({ dry: false });
    expect(run.skipped).toBe("INSIGHTS_EMAIL_ENABLED is off");
    expect(run.sent).toBe(0);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(sendInsightsBrief).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ cron dedupe (flag on) */

type Row = Record<string, unknown>;
/** Just enough of the Supabase query builder for runInsightsBrief. `claim` = whether the brief-log insert wins. */
function fakeDb(tables: Record<string, Row[]>, claim: boolean) {
  const calls: string[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      in: (c: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[c]))), q),
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
      gt: () => q,
      gte: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      upsert: (payload: unknown) => {
        calls.push(`upsert:${table}`);
        const res = { data: claim ? [payload] : [], error: null };
        return { select: async () => res, then: (ok: (v: unknown) => void) => ok({ error: null }) };
      },
      update: () => {
        calls.push(`update:${table}`);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
      insert: async () => {
        calls.push(`insert:${table}`);
        return { error: null };
      },
      then: (ok: (v: unknown) => void) => ok({ data: rows, error: null }),
    });
    return q;
  };
  return { db: { from }, calls };
}

describe("weekly brief cron: one per member per week", () => {
  const env = { ...process.env };
  const ORG = "00000000-0000-0000-0000-0000000000a1";
  const USER = "00000000-0000-0000-0000-0000000000b1";
  const fixture = () => {
    const rfps = [
      ...[40_000, 50_000, 60_000, 70_000, 80_000].map((v, i) => award({ province: "Nova Scotia", date: `2026-0${i + 4}-10`, amount: v })),
      award({ date: "2026-10-01", winner: "Alpha Snow Ltd" }),
      award({ date: "2026-10-03", winner: "Alpha Snow Ltd" }),
    ];
    return { ...dataOf(rfps), categories: [{ slug: "snow-removal", name: "Snow Removal", icon: null }] };
  };
  const tables = (logged: boolean): Record<string, Row[]> => ({
    subscriptions: [{ organization_id: ORG, status: "active", tier: "pro" }],
    trade_trials: [],
    intel_access: [],
    organizations: [{ id: ORG, name: "Truro Snow Co", city: "Truro", province: "Nova Scotia", country: "CA", organization_type: "trade_company", status: "approved", is_demo: false }],
    organization_categories: [{ organization_id: ORG, trade_categories: { slug: "snow-removal" } }],
    organization_regions: [],
    organization_members: [{ organization_id: ORG, user_id: USER }],
    users_profile: [{ id: USER, email: "owner@truro.example", status: "active" }],
    notification_preferences: [{ user_id: USER, new_rfps: "weekly", channel_email: true }],
    signup_attribution: [{ user_id: USER, lang: "fr" }],
    insight_brief_log: logged ? [{ user_id: USER, week: isoWeekKey(TODAY) }] : [],
    lead_alert_log: [],
  });
  async function run(logged: boolean, claim: boolean) {
    vi.resetModules();
    process.env.INSIGHTS_EMAIL_ENABLED = "1";
    delete process.env.INSIGHTS_LLM;
    const fake = fakeDb(tables(logged), claim);
    const sendInsightsBrief = vi.fn(async () => undefined);
    vi.doMock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient: () => fake.db }));
    vi.doMock("@/lib/email/send", () => ({ sendInsightsBrief, insightsBriefHtml: () => "" }));
    vi.doMock("@/lib/insights/load", () => ({ loadInsightData: async () => fixture() }));
    vi.doMock("@/lib/major-projects/data", () => ({ getMajorProjects: async () => [] }));
    vi.doMock("@/lib/data/taxonomy", () => ({
      getTaxonomyRows: async (t: string) => (t === "trade_categories" ? [{ id: "t1", slug: "snow-removal", name: "Snow Removal" }] : [{ id: "r1", slug: "nova-scotia", name: "Nova Scotia", province: "Nova Scotia", country: "Canada", parent_id: null }]),
    }));
    const { runInsightsBrief } = await import("@/lib/insights/server");
    return { result: await runInsightsBrief({ dry: false }), sendInsightsBrief, calls: fake.calls };
  }
  afterEach(() => {
    process.env = { ...env };
    for (const m of ["@/lib/supabase/config", "@/lib/supabase/service", "@/lib/email/send", "@/lib/insights/load", "@/lib/major-projects/data", "@/lib/data/taxonomy"]) vi.doUnmock(m);
  });
  it("sends once, in the member's language, logging before sending", async () => {
    const { result, sendInsightsBrief, calls } = await run(false, true);
    expect(result.sent).toBe(1);
    expect(sendInsightsBrief).toHaveBeenCalledTimes(1);
    const [to, email, lang] = sendInsightsBrief.mock.calls[0] as unknown as [string, { subject: string }, string];
    expect(to).toBe("owner@truro.example");
    expect(lang).toBe("fr");
    expect(email.subject).toContain("Truro");
    expect(calls.indexOf("upsert:insight_brief_log")).toBeLessThan(calls.indexOf("update:insight_brief_log"));
  });
  it("already logged this week: no second brief", async () => {
    const { result, sendInsightsBrief } = await run(true, true);
    expect(result.sent).toBe(0);
    expect(result.skips["already-sent"]).toBe(1);
    expect(sendInsightsBrief).not.toHaveBeenCalled();
  });
  it("lost the race to a parallel run (insert ignored): no send", async () => {
    const { result, sendInsightsBrief } = await run(false, false);
    expect(result.sent).toBe(0);
    expect(sendInsightsBrief).not.toHaveBeenCalled();
  });
});
