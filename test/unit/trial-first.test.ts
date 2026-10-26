import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, orgIsHeld, trialRefusal, trialState, trialEndsAt, TRIAL_SOURCES, parseTrialSource } from "@/lib/entitlement/trial";
import {
  canStartTrialNow,
  gateMode,
  gateOffer,
  safeReturnPath,
  startTrialPath,
  trialNextFromSignUp,
  trialSignUpHref,
  whoFromSession,
  withTrialStartedParam,
  type GateWho,
} from "@/lib/entitlement/gate";
import { EXPIRED_NOTE_DAYS, NO_USAGE, lostParts, trialBannerView, trialDayNumber, usedParts } from "@/lib/entitlement/banner";
import { bannerCopy } from "@/lib/entitlement/banner-copy";
import { MISSED_TITLES_SHOWN, computeMissedBids, isStillOpen, type MissedRfp } from "@/lib/entitlement/missed-bids";
import { freeDigestMatches } from "@/lib/alerts/country";
import { missedBidsEmailEnabled, missedBidsEmailHtml, missedBidsTrialUrl } from "@/lib/entitlement/missed-bids-email";
import { annualSaving } from "@/lib/pricing/annual";
import { PRICING } from "@/lib/site";
import { CLIENT_EVENTS, SITE_EVENTS, isClientEvent, isSiteEvent } from "@/lib/tracking/events";
import { EMPTY_REPORT, marketView, type RawReport } from "@/lib/tracking/report";
import { SIGNUP_INTENT_TTL_S, intentFromParams, parseIntent, serializeIntent } from "@/lib/auth/signup-intent";
import trialFirst from "@/i18n/messages/trialFirst";
import { getDictionary } from "@/i18n/dictionaries";
import type { CountryCode } from "@/lib/visitor-geo";

const root = (p: string) => join(__dirname, "..", "..", p);
const read = (p: string) => readFileSync(root(p), "utf8");

const NOW = new Date("2026-10-26T15:00:00.000Z");
const DAY = 86_400_000;
const trialStartedDaysAgo = (d: number) => {
  const start = new Date(NOW.getTime() - d * DAY);
  return trialState({ startedAt: start.toISOString(), endsAt: trialEndsAt(start).toISOString() }, NOW);
};

const tradeOrg = { organization_type: "trade_company", status: "active", profile_status: "pending_review" };

describe("who can start a trial (refusals)", () => {
  const base = { signedIn: true, organizationType: "trade_company", organizationStatus: "active", organizationProfileStatus: "pending_review", paid: false, existing: null };
  it("an eligible trade company, including one still waiting in review, can", () => {
    expect(trialRefusal(base)).toBeNull();
    expect(trialRefusal({ ...base, organizationProfileStatus: "approved" })).toBeNull();
    expect(trialRefusal({ ...base, organizationProfileStatus: "draft" })).toBeNull();
  });
  it("refuses a rejected, suspended, deleted or risk-flagged company", () => {
    expect(trialRefusal({ ...base, organizationProfileStatus: "rejected" })).toBe("held");
    expect(trialRefusal({ ...base, organizationProfileStatus: "suspended" })).toBe("held");
    expect(trialRefusal({ ...base, organizationStatus: "deleted" })).toBe("held");
    expect(trialRefusal({ ...base, riskFlagged: true })).toBe("held");
    expect(trialRefusal({ ...base, organizationStatus: "suspended" })).toBe("suspended");
  });
  it("refuses signed-out, no company, a non-trade company, paying and used", () => {
    expect(trialRefusal({ ...base, signedIn: false })).toBe("signin");
    expect(trialRefusal({ ...base, organizationType: null })).toBe("org");
    expect(trialRefusal({ ...base, organizationType: "property_manager" })).toBe("role");
    expect(trialRefusal({ ...base, paid: true })).toBe("paid");
    expect(trialRefusal({ ...base, existing: { startedAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-15T00:00:00Z" } })).toBe("used");
  });
  it("orgIsHeld", () => {
    expect(orgIsHeld({ status: "active", profileStatus: "approved" })).toBe(false);
    expect(orgIsHeld({ profileStatus: "rejected" })).toBe(true);
  });
  it("every trial source passes the table's source check (a-z0-9_-, 2 to 30 characters)", () => {
    for (const s of TRIAL_SOURCES) expect(s).toMatch(/^[a-z0-9_-]{2,30}$/);
    expect(parseTrialSource("missed_bids")).toBe("missed_bids");
    expect(parseTrialSource("<script>")).toBe("dashboard");
  });
});

describe("the upgrade CTA matrix (gateMode / gateOffer)", () => {
  const trade: GateWho = { signedIn: true, onboarded: true, organizationType: "trade_company", organizationStatus: "active", organizationProfileStatus: "approved", paid: false, trial: trialState(null), trialsOpen: true };
  const paidHref = "/dashboard/billing?plan=pro&interval=annual";
  const cases: [string, GateWho, string][] = [
    ["signed out", { signedIn: false, trialsOpen: true }, "signup_trial"],
    ["signed in, no company yet", { signedIn: true, trialsOpen: true }, "resume"],
    ["trade company that can start", trade, "trial"],
    ["trade company in review (pending)", { ...trade, organizationProfileStatus: "pending_review" }, "trial"],
    ["trial running", { ...trade, trial: trialStartedDaysAgo(2) }, "paid"],
    ["trial ended", { ...trade, trial: trialStartedDaysAgo(30) }, "paid"],
    ["paying member", { ...trade, paid: true }, "paid"],
    ["property manager", { ...trade, organizationType: "property_manager" }, "paid"],
    ["rejected company", { ...trade, organizationProfileStatus: "rejected" }, "paid"],
    ["suspended company", { ...trade, organizationStatus: "suspended" }, "paid"],
    ["risk-flagged company", { ...trade, riskFlagged: true }, "paid"],
    ["trials switched off (no table)", { ...trade, trialsOpen: false }, "paid"],
    ["signed out, trials off", { signedIn: false, trialsOpen: false }, "paid"],
  ];
  for (const [name, who, mode] of cases) {
    it(`${name} -> ${mode}`, () => {
      expect(gateMode(who)).toBe(mode);
    });
  }
  it("the offer carries a form for trials, trial links for visitors, the page's own paid link otherwise", () => {
    const o = gateOffer(trade, { source: "listing", returnPath: "/rfps/roof-1", paidHref });
    expect(o.mode).toBe("trial");
    expect(o.href).toBe("/start-trial?source=listing&return=%2Frfps%2Froof-1");
    const v = gateOffer({ signedIn: false, trialsOpen: true }, { source: "benchmark", returnPath: "/benchmarks/roofing/ontario", paidHref });
    expect(v.href).toBe("/sign-up?role=trade&plan=trial&source=benchmark&return=%2Fbenchmarks%2Froofing%2Fontario");
    const p = gateOffer({ ...trade, paid: true }, { source: "gate", returnPath: "/x", paidHref });
    expect(p).toMatchObject({ mode: "paid", href: paidHref, plansHref: "/pricing" });
  });
  it("canStartTrialNow ignores the global switch", () => {
    const { trialsOpen: _t, ...rest } = trade;
    void _t;
    expect(canStartTrialNow(rest)).toBe(true);
  });
  it("whoFromSession reads the organization and trial off a session", () => {
    const who = whoFromSession({ paid: false, trial: trialState(null), profile: { onboarding_completed: true }, organization: tradeOrg }, true);
    expect(who).toMatchObject({ signedIn: true, onboarded: true, organizationType: "trade_company", organizationProfileStatus: "pending_review", trialsOpen: true });
    expect(whoFromSession(null, true).signedIn).toBe(false);
  });
});

describe("return-to behaviour", () => {
  it("keeps a same-site path and drops the language prefix", () => {
    expect(safeReturnPath("/rfps/roof-1")).toBe("/rfps/roof-1");
    expect(safeReturnPath("/fr/rfps/roof-1?x=1")).toBe("/rfps/roof-1?x=1");
    expect(safeReturnPath("/es/benchmarks/a/b")).toBe("/benchmarks/a/b");
  });
  it("refuses other sites, API/auth/trial routes, junk and long paths", () => {
    for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil", "/api/stripe/webhook", "/auth/callback", "/start-trial?source=gate", "/checkout?plan=pro", "javascript:alert(1)", "", null, undefined, `/${"a".repeat(400)}`]) {
      expect(safeReturnPath(bad as string | null | undefined)).toBeNull();
    }
  });
  it("adds ?trial=started once, before any #hash", () => {
    expect(withTrialStartedParam("/rfps/a")).toBe("/rfps/a?trial=started");
    expect(withTrialStartedParam("/rfps/a?x=1#top")).toBe("/rfps/a?x=1&trial=started#top");
    expect(withTrialStartedParam("/dashboard?trial=used")).toBe("/dashboard?trial=used");
  });
});

describe("signed-out resume", () => {
  it("sign-up with plan=trial resumes at /start-trial with the source and the page", () => {
    const href = trialSignUpHref("listing", "/rfps/roof-1");
    expect(href).toBe("/sign-up?role=trade&plan=trial&source=listing&return=%2Frfps%2Froof-1");
    const q = new URL(href, "https://pmrfp.com").searchParams;
    expect(trialNextFromSignUp({ plan: q.get("plan"), source: q.get("source"), return: q.get("return") })).toBe(startTrialPath("listing", "/rfps/roof-1"));
  });
  it("is not a trial ask for any other plan, and a bad return is dropped", () => {
    expect(trialNextFromSignUp({ plan: "pro", source: "gate", return: "/x" })).toBeNull();
    expect(trialNextFromSignUp({ plan: "trial", source: "nope", return: "https://evil.example" })).toBe("/start-trial?source=dashboard");
  });
  it("survives the emailed link: the sign-up intent cookie keeps the /start-trial path", () => {
    const next = trialNextFromSignUp({ plan: "trial", source: "gate", return: "/rfps/roof-1" })!;
    const intent = intentFromParams({ role: "trade", next }, NOW.getTime())!;
    expect(intent.next).toBe(next);
    const back = parseIntent(serializeIntent(intent), NOW.getTime() + 60_000)!;
    expect(back.next).toBe(next);
    expect(parseIntent(serializeIntent(intent), NOW.getTime() + (SIGNUP_INTENT_TTL_S + 5) * 1000)).toBeNull();
  });
});

describe("trial banner day math", () => {
  it("day 1 of 14 right after the start, 14 on the last day, never past 14", () => {
    expect(trialDayNumber(trialStartedDaysAgo(0), NOW)).toBe(1);
    expect(trialDayNumber(trialStartedDaysAgo(2.5), NOW)).toBe(3);
    expect(trialDayNumber(trialStartedDaysAgo(13.5), NOW)).toBe(14);
    expect(TRIAL_DAYS).toBe(14);
  });
  it("3 days left is tone three; under a day is tone one", () => {
    const at = (left: number) => {
      const end = new Date(NOW.getTime() + left * DAY);
      const start = new Date(end.getTime() - TRIAL_DAYS * DAY);
      return trialBannerView({ paid: false, trial: trialState({ startedAt: start.toISOString(), endsAt: end.toISOString() }, NOW) }, NOW);
    };
    expect(at(3)).toMatchObject({ kind: "active", daysLeft: 3, tone: "three" });
    expect(at(2)).toMatchObject({ daysLeft: 2, tone: "normal" });
    expect(at(0.4)).toMatchObject({ daysLeft: 1, tone: "one" });
  });
  it("after the end: a calm note for 30 days, then nothing; nothing for paying members or no trial", () => {
    expect(trialBannerView({ paid: false, trial: trialStartedDaysAgo(20) }, NOW)).toMatchObject({ kind: "expired" });
    expect(trialBannerView({ paid: false, trial: trialStartedDaysAgo(TRIAL_DAYS + EXPIRED_NOTE_DAYS + 2) }, NOW)).toBeNull();
    expect(trialBannerView({ paid: true, trial: trialStartedDaysAgo(3) }, NOW)).toBeNull();
    expect(trialBannerView({ paid: false, trial: trialState(null) }, NOW)).toBeNull();
    expect(trialBannerView({ paid: false }, NOW)).toBeNull();
  });
  it("lists only what was really used", () => {
    expect(usedParts(NO_USAGE)).toEqual([]);
    expect(usedParts({ alerts: 4, saved: 0, responses: 2 })).toEqual([{ key: "alerts", n: 4 }, { key: "responses", n: 2 }]);
    expect(lostParts({ alerts: 0, saved: 5, responses: 2 })).toEqual([]);
    expect(lostParts({ alerts: 3, saved: 0, responses: 0 })).toEqual([{ key: "alerts", n: 3 }]);
  });
});

describe("banner words in en, fr and es", () => {
  const active = (left: number) => {
    const end = new Date(NOW.getTime() + left * DAY);
    const start = new Date(end.getTime() - TRIAL_DAYS * DAY);
    return trialBannerView({ paid: false, trial: trialState({ startedAt: start.toISOString(), endsAt: end.toISOString() }, NOW) }, NOW)!;
  };
  const used = { alerts: 4, saved: 2, responses: 0 };
  it("English: day count, days left and real usage", () => {
    const c = bannerCopy(active(11), used, "en");
    expect(c.title).toBe("Trial day 4 of 14");
    expect(c.detail).toBe("Trial: 11 days left · 4 alerts received, 2 bids saved");
    expect(bannerCopy(active(1), NO_USAGE, "en").detail).not.toContain("undefined");
  });
  it("says nothing was used when nothing was", () => {
    expect(bannerCopy(active(11), NO_USAGE, "en").detail).toContain("Open your matches");
  });
  it("3 days and 1 day left are stronger, still truthful (a date, no invented urgency)", () => {
    const three = bannerCopy(active(3), used, "en");
    expect(three.tone).toBe("three");
    expect(three.detail).toMatch(/^3 days left\. Pro access ends on /);
    const one = bannerCopy(active(0.4), used, "en");
    expect(one.tone).toBe("one");
    expect(one.detail).toMatch(/^Last day\. Pro access ends on /);
    expect(one.detail).toContain("4 alerts received");
  });
  it("after expiry: the date, and only features they used", () => {
    const view = trialBannerView({ paid: false, trial: trialStartedDaysAgo(20) }, NOW)!;
    const lost = bannerCopy(view, used, "en");
    expect(lost.kind).toBe("expired");
    expect(lost.title).toMatch(/^Your trial ended on /);
    expect(lost.lostHead).toBe("Here is what you have lost access to:");
    expect(lost.lost).toEqual(["The daily bid alert emails (4 reached you during the trial)"]);
    const none = bannerCopy(view, NO_USAGE, "en");
    expect(none.lost).toEqual([]);
    expect(none.lostHead).toBeNull();
    expect(none.detail).toBe("You are on the free plan again.");
  });
  it("speaks French and Spanish", () => {
    expect(bannerCopy(active(11), used, "fr").title).toBe("Essai : jour 4 sur 14");
    expect(bannerCopy(active(11), used, "fr").detail).toContain("jours restants");
    expect(bannerCopy(active(11), used, "es").title).toBe("Prueba: día 4 de 14");
    expect(bannerCopy(active(11), used, "es").detail).toContain("quedan 11 días");
    const view = trialBannerView({ paid: false, trial: trialStartedDaysAgo(20) }, NOW)!;
    expect(bannerCopy(view, used, "fr").upgradeLabel).toBe("Passer au payant");
    expect(bannerCopy(view, used, "es").lost[0]).toContain("alertas diarias");
  });
});

describe("bids you may have missed", () => {
  const byRegion = new Map<string, CountryCode>([
    ["on", "CA"],
    ["tor", "CA"],
    ["tx", "US"],
    ["ca", "CA"],
    ["us", "US"],
  ]);
  const national = new Set(["ca", "us"]);
  const rfp = (id: string, o: Partial<MissedRfp> = {}): MissedRfp => ({
    id,
    title: `Bid ${id}`,
    slug: `bid-${id}`,
    deadline: "2026-11-20",
    region_id: "tor",
    province: "Ontario",
    rfp_categories: [{ category_id: "roofing" }],
    ...o,
  });
  const org = { categories: new Set(["roofing"]), regions: new Set(["on", "tor"]), countries: new Set<CountryCode>(["CA"]) };
  const TODAY = "2026-10-26";

  it("is exactly the Monday roundup's match (freeDigestMatches), split into open and closed", () => {
    const week = [rfp("a"), rfp("b", { deadline: null }), rfp("c", { deadline: "2026-10-20" }), rfp("d", { rfp_categories: [{ category_id: "plumbing" }] }), rfp("e", { region_id: "tx", province: "Texas" })];
    const direct = freeDigestMatches(week, org, national, byRegion).map((r) => r.id);
    expect(direct.sort()).toEqual(["a", "b", "c"]);
    const m = computeMissedBids(week, org, national, byRegion, TODAY)!;
    expect(m.openCount).toBe(2);
    expect(m.closedCount).toBe(1);
    expect(m.openCount + m.closedCount).toBe(direct.length);
  });
  it("shows up to three titles, soonest closing first, no closing date last", () => {
    const week = [rfp("a", { deadline: "2026-11-30" }), rfp("b", { deadline: null }), rfp("c", { deadline: "2026-10-28" }), rfp("d", { deadline: "2026-11-02" }), rfp("e", { deadline: "2026-12-01" })];
    const m = computeMissedBids(week, org, national, byRegion, TODAY)!;
    expect(m.openCount).toBe(5);
    expect(m.shown).toHaveLength(MISSED_TITLES_SHOWN);
    expect(m.shown.map((s) => s.slug)).toEqual(["bid-c", "bid-d", "bid-a"]);
  });
  it("hides the card entirely when nothing open matched (no fake numbers)", () => {
    expect(computeMissedBids([], org, national, byRegion, TODAY)).toBeNull();
    expect(computeMissedBids([rfp("c", { deadline: "2026-10-20" })], org, national, byRegion, TODAY)).toBeNull();
    expect(computeMissedBids([rfp("a")], { ...org, categories: new Set() }, national, byRegion, TODAY)).toBeNull();
  });
  it("keeps Canada and the U.S. apart", () => {
    const week = [rfp("ca"), rfp("us", { region_id: "tx", province: "Texas" }), rfp("natl-ca", { region_id: "ca", province: null }), rfp("natl-us", { region_id: "us", province: null })];
    const canadian = computeMissedBids(week, org, national, byRegion, TODAY)!;
    expect(canadian.shown.map((s) => s.slug).sort()).toEqual(["bid-ca", "bid-natl-ca"]);
    const american = computeMissedBids(week, { categories: org.categories, regions: new Set(["tx"]), countries: new Set<CountryCode>(["US"]) }, national, byRegion, TODAY)!;
    expect(american.shown.map((s) => s.slug).sort()).toEqual(["bid-natl-us", "bid-us"]);
    // A company with a Canadian region never gets the U.S. bid, even one filed with no region.
    expect(computeMissedBids([rfp("x", { region_id: null, province: "Texas" })], org, national, byRegion, TODAY)).toBeNull();
  });
  it("a bid with no closing date counts as open", () => {
    expect(isStillOpen(null, TODAY)).toBe(true);
    expect(isStillOpen("2026-10-26", TODAY)).toBe(true);
    expect(isStillOpen("2026-10-25", TODAY)).toBe(false);
  });
});

describe("the Monday roundup block", () => {
  it("is off unless MISSED_BIDS_BLOCK_ENABLED is 1 or true", () => {
    expect(missedBidsEmailEnabled({})).toBe(false);
    expect(missedBidsEmailEnabled({ MISSED_BIDS_BLOCK_ENABLED: "0" })).toBe(false);
    expect(missedBidsEmailEnabled({ MISSED_BIDS_BLOCK_ENABLED: "" })).toBe(false);
    expect(missedBidsEmailEnabled({ MISSED_BIDS_BLOCK_ENABLED: "1" })).toBe(true);
    expect(missedBidsEmailEnabled({ MISSED_BIDS_BLOCK_ENABLED: "TRUE" })).toBe(true);
  });
  it("draws nothing without a real count", () => {
    expect(missedBidsEmailHtml("en", null, "https://pmrfp.com/x")).toBe("");
    expect(missedBidsEmailHtml("en", { openCount: 0, closedCount: 3 }, "https://pmrfp.com/x")).toBe("");
  });
  const url = missedBidsTrialUrl("https://pmrfp.com", "en");
  it("English: the counts, the Pro-email line and a trial link into sign-in then the trial page", () => {
    const html = missedBidsEmailHtml("en", { openCount: 4, closedCount: 2 }, url);
    expect(html).toContain("Bids you may have missed");
    expect(html).toContain("This week 4 open bids matched your trade and region; 2 closed.");
    expect(html).toContain("Pro members were emailed these the morning they were posted.");
    expect(html).toContain("Start your free trial");
    expect(url).toBe("https://pmrfp.com/sign-in?next=%2Fstart-trial%3Fsource%3Ddigest%26return%3D%252Fdashboard");
    expect(html).toContain(`href="${url}"`);
  });
  it("singular, and no 'closed' clause when none closed", () => {
    const html = missedBidsEmailHtml("en", { openCount: 1, closedCount: 0 }, url);
    expect(html).toContain("This week 1 open bid matched your trade and region. Pro members were emailed it the morning it was posted.");
  });
  it("French and Spanish, with a language-prefixed link", () => {
    const fr = missedBidsEmailHtml("fr", { openCount: 3, closedCount: 1 }, missedBidsTrialUrl("https://pmrfp.com", "fr"));
    expect(fr).toContain("Appels d'offres que vous avez peut-être manqués");
    expect(fr).toContain("Cette semaine, 3 appels d'offres ouverts correspondaient à votre métier et à votre région ; 1 fermé.");
    expect(fr).toContain("Commencer votre essai gratuit");
    expect(fr).toContain("https://pmrfp.com/fr/sign-in?next=");
    const es = missedBidsEmailHtml("es", { openCount: 3, closedCount: 0 }, missedBidsTrialUrl("https://pmrfp.com", "es"));
    expect(es).toContain("Licitaciones que quizá se perdió");
    expect(es).toContain("Esta semana 3 licitaciones abiertas coincidieron con su oficio y su región.");
    expect(es).toContain("Comience su prueba gratis");
  });
  it("sits above the existing CTA inside the same digest, and is wired behind the flag in the cron", () => {
    const send = read("src/lib/email/send.ts");
    expect(send.indexOf("${params.missedHtml")).toBeGreaterThan(send.indexOf("${params.followedHtml"));
    expect(send.indexOf("${params.missedHtml")).toBeLessThan(send.indexOf("What Trade Pro adds"));
    const cron = read("src/app/api/cron/tender-digest/route.ts");
    expect(cron).toContain("missedBidsEmailEnabled()");
    expect(cron).toMatch(/missedOn && cats\?\.size \? computeMissedBids/);
    // No new send: the cron still has exactly one sendTenderDigest call.
    expect(cron.match(/sendTenderDigest\(/g)).toHaveLength(1);
  });
});

describe("copy in three languages", () => {
  const keys = (o: unknown, p = ""): string[] =>
    o && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k))
      : [p];
  const leaves = (o: unknown): string[] => (o && typeof o === "object" ? Object.values(o as Record<string, unknown>).flatMap(leaves) : [String(o)]);
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  it("fr and es have every key en has, none empty", () => {
    expect(keys(trialFirst.fr).sort()).toEqual(keys(trialFirst.en).sort());
    expect(keys(trialFirst.es).sort()).toEqual(keys(trialFirst.en).sort());
    for (const lang of ["en", "fr", "es"] as const) for (const s of leaves(trialFirst[lang])) expect(s.trim().length).toBeGreaterThan(0);
  });
  it("placeholders match across languages", () => {
    const flat = (o: unknown, p = ""): [string, string][] =>
      o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [[p, String(o)]];
    const en = new Map(flat(trialFirst.en));
    for (const lang of ["fr", "es"] as const)
      for (const [k, v] of flat(trialFirst[lang])) expect(placeholders(v), `${lang}.${k}`).toBe(placeholders(en.get(k)!));
  });
  it("the primary button says what it does in each language", () => {
    expect(getDictionary("en").trialFirst.cta.start).toBe("Start 14-day free trial (no card)");
    expect(getDictionary("fr").trialFirst.cta.start).toContain("14 jours");
    expect(getDictionary("es").trialFirst.cta.start).toContain("14 días");
    for (const l of ["en", "fr", "es"] as const) expect(getDictionary(l).trialFirst.cta.seePlans.length).toBeGreaterThan(0);
  });
  it("the 'held' flash exists in every language", () => {
    for (const l of ["en", "fr", "es"] as const) expect(getDictionary(l).leads.trial.flash.held.length).toBeGreaterThan(0);
  });
});

describe("annual vs monthly framing", () => {
  it("is computed from the real price constants", () => {
    const s = annualSaving()!;
    expect(s).toEqual({ annual: PRICING.proAnnual, monthly: PRICING.proMonthly, yearly: PRICING.proMonthly * 12, save: PRICING.proMonthly * 12 - PRICING.proAnnual });
    expect(`$${s.annual} a year vs $${s.yearly} at $${s.monthly} a month: save $${s.save}`).toBe("$249 a year vs $348 at $29 a month: save $99");
  });
  it("is null whenever yearly is not actually cheaper", () => {
    expect(annualSaving({ proAnnual: 348, proMonthly: 29 })).toBeNull();
    expect(annualSaving({ proAnnual: 400, proMonthly: 29 })).toBeNull();
    expect(annualSaving({ proAnnual: 0, proMonthly: 29 })).toBeNull();
  });
  it("the comparison line is filled in each language", () => {
    const fill = (t: string) => t.replace("{annual}", "249").replace("{yearly}", "348").replace("{monthly}", "29").replace("{save}", "99");
    expect(fill(trialFirst.en.compare)).toBe("$249 a year vs $348 at $29 a month: save $99");
    expect(fill(trialFirst.fr.compare)).toContain("économisez 99 $");
    expect(fill(trialFirst.es.compare)).toContain("ahorre 99 $");
  });
});

describe("events: recorded and in the funnel", () => {
  const NEW = ["trial_cta_clicked", "trial_banner_upgrade_clicked", "missed_bids_card_viewed"];
  it("are site events the browser may report; trial_started stays server-side", () => {
    for (const e of NEW) {
      expect(isSiteEvent(e)).toBe(true);
      expect(isClientEvent(e)).toBe(true);
      expect(SITE_EVENTS).toContain(e);
      expect(CLIENT_EVENTS).toContain(e);
    }
    expect(isSiteEvent("trial_started")).toBe(true);
    expect(isClientEvent("trial_started")).toBe(false);
  });
  it("the migration allows them in the table and in the batch writer", () => {
    const sql = read("supabase/migrations/20261025000100_trial_first_events.sql");
    for (const e of NEW) expect(sql.split(`'${e}'`).length - 1).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("drop constraint if exists site_events_event_check");
    expect(sql).toContain("create or replace function public.record_site_beacon");
  });
  it("/admin/analytics gets a trial funnel with the start rate", () => {
    const raw: RawReport = {
      ...EMPTY_REPORT,
      events: [
        { market: "CA", event: "trial_cta_clicked", role_group: "trade", actors: 20, n: 25 },
        { market: "CA", event: "trial_started", role_group: "trade", actors: 8, n: 8 },
        { market: "CA", event: "trial_banner_upgrade_clicked", role_group: "trade", actors: 3, n: 4 },
        { market: "CA", event: "checkout_completed", role_group: "trade", actors: 1, n: 1 },
        { market: "US", event: "trial_cta_clicked", role_group: "trade", actors: 5, n: 5 },
      ],
    } as RawReport;
    const ca = marketView(raw, "CA");
    expect(ca.funnel.trial.map((s) => [s.key, s.n])).toEqual([
      ["trial_cta_clicked", 20],
      ["trial_started", 8],
      ["trial_banner_upgrade_clicked", 3],
      ["checkout_completed", 1],
    ]);
    // Canada and the U.S. are never added together.
    expect(marketView(raw, "US").funnel.trial[0].n).toBe(5);
    expect(ca.activity.map((a) => a.event)).toEqual(expect.arrayContaining(NEW));
    const page = read("src/app/[lang]/admin/analytics/page.tsx");
    expect(page).toContain("v.funnel.trial");
    expect(page).toContain("Trial start rate");
  });
});
