/**
 * Paid sponsorships sold by TRADE × PROVINCE/STATE (plus a national tier and
 * an email-only tier). Pure: no database, no React, so it is unit-tested.
 *
 * Rules:
 *  - Canada and the U.S. are never mixed: a sponsor belongs to ONE country
 *    and only matches pages, emails and visitors in that country.
 *  - One sponsor per slot. A slot is country × trade × province × channel
 *    (web pages or emails). A province sponsor holds its province; the
 *    national sponsor of a trade fills every province nobody holds, plus
 *    country-wide pages (the trade's forum). The digest tier holds emails only.
 *  - At most one sponsor unit per page or email, always labelled
 *    "Sponsored", links rel="sponsored noopener", clicks via /go/<slug>.
 *  - Never on dashboards' work areas, sign-up/sign-in, pricing, billing or
 *    checkout (EXCLUDED_ROUTES).
 */
import { CA_PROVINCES, US_STATES, US_STATE_NAMES, isUsState } from "@/lib/geo";
import type { SponsorTier } from "./pricing";

export type SponsorCountry = "CA" | "US";

/** Where a sponsor unit can appear. Paid sponsors never appear on dashboards. */
export type Placement =
  | "rfp_detail"
  | "trade_page"
  | "benchmark"
  | "major_projects"
  | "forum"
  | "alerts_email"
  | "digest_email";

export const PLACEMENTS: readonly Placement[] = [
  "rfp_detail",
  "trade_page",
  "benchmark",
  "major_projects",
  "forum",
  "alerts_email",
  "digest_email",
];

export const EMAIL_PLACEMENTS: readonly Placement[] = ["alerts_email", "digest_email"];
export const WEB_PLACEMENTS: readonly Placement[] = PLACEMENTS.filter((p) => !EMAIL_PLACEMENTS.includes(p));

export type Channel = "web" | "email";
export const channelOf = (p: Placement): Channel => (EMAIL_PLACEMENTS.includes(p) ? "email" : "web");

/** Which placements each tier is sold for. */
export const TIER_CHANNELS: Record<SponsorTier, readonly Channel[]> = {
  province: ["web", "email"],
  national: ["web", "email"],
  digest: ["email"],
};

export type SponsorStatus = "draft" | "pending" | "approved" | "paused" | "ended" | "rejected";
export const SPONSOR_STATUSES: readonly SponsorStatus[] = ["draft", "pending", "approved", "paused", "ended", "rejected"];

/**
 * Statuses that hold a slot: paid and waiting for review, live, or paused
 * by us. A draft (enquiry, unpaid checkout) holds nothing.
 */
export const HOLDING_STATUSES: readonly SponsorStatus[] = ["pending", "approved", "paused"];

/** Slugs taken by the house sponsors in registry.ts (their /go links). */
export const RESERVED_SLUGS = ["maple", "cleverpays", "talkerstein"];

export interface PaidSponsor {
  id: string;
  /** /go/<slug>; lowercase letters, digits and dashes, ≤ 40. */
  slug: string;
  name: string;
  /** https URL or a /logos/... path. */
  logoUrl: string | null;
  url: string;
  headline: string;
  message: string;
  cta: string;
  /** French copy: required for Québec, used on French pages when present. */
  headlineFr: string | null;
  messageFr: string | null;
  ctaFr: string | null;
  tier: SponsorTier;
  country: SponsorCountry;
  /** Trade slugs (trade_categories.slug). */
  trades: string[];
  /** Full province/state names ("Ontario", "Texas"). Empty for national. */
  regions: string[];
  /** YYYY-MM-DD, inclusive. */
  startDate: string | null;
  /** YYYY-MM-DD, inclusive; null = until cancelled. */
  endDate: string | null;
  status: SponsorStatus;
}

/* ------------------------------------------------------------------ places */

/** "ON", "ontario", "Québec", "TX", "texas" → "Ontario" / "Quebec" / "Texas"; null when unknown. */
export function normalizeRegion(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const plain = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/-/g, " ");
  const ca = CA_PROVINCES.find((p) => p.toLowerCase() === plain);
  if (ca) return ca;
  const caCodes: Record<string, string> = {
    ON: "Ontario", QC: "Quebec", PQ: "Quebec", BC: "British Columbia", AB: "Alberta", MB: "Manitoba",
    SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick", NL: "Newfoundland and Labrador",
    PE: "Prince Edward Island", PEI: "Prince Edward Island", YT: "Yukon", NT: "Northwest Territories", NU: "Nunavut",
  };
  const up = s.toUpperCase();
  if (caCodes[up]) return caCodes[up];
  const us = US_STATE_NAMES.find((n) => n.toLowerCase() === plain.replace(/^us /, ""));
  if (us) return us;
  if (US_STATES[up]) return US_STATES[up];
  return null;
}

export function regionCountryOf(region: string): SponsorCountry {
  return isUsState(region) ? "US" : "CA";
}

/** Provinces/states a sponsor can buy in a country. */
export function regionsFor(country: SponsorCountry): string[] {
  return country === "US" ? [...US_STATE_NAMES] : [...CA_PROVINCES];
}

/** "Glass and Windows" → "glass-and-windows" (matches trade_categories.slug). */
export function tradeSlug(nameOrSlug: string): string {
  return nameOrSlug
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ------------------------------------------------------------------ slots */

export interface SlotKey {
  country: SponsorCountry;
  trade: string;
  /** Full province/state name, or "*" for the national slot. */
  region: string;
  channel: Channel;
}

export const slotId = (k: SlotKey) => `${k.country}|${k.trade}|${k.region}|${k.channel}`;

/** Every slot a sponsor holds. */
export function slotKeys(s: Pick<PaidSponsor, "tier" | "country" | "trades" | "regions">): SlotKey[] {
  const out: SlotKey[] = [];
  const regions = s.tier === "national" ? ["*"] : s.regions;
  for (const trade of s.trades)
    for (const region of regions)
      for (const channel of TIER_CHANNELS[s.tier]) out.push({ country: s.country, trade, region, channel });
  return out;
}

const day = (d: string | null | undefined, fallback: string) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : fallback);

/** Two date ranges (inclusive, open-ended when null) overlap. */
export function datesOverlap(a: { startDate: string | null; endDate: string | null }, b: { startDate: string | null; endDate: string | null }): boolean {
  const aStart = day(a.startDate, "0000-01-01");
  const aEnd = day(a.endDate, "9999-12-31");
  const bStart = day(b.startDate, "0000-01-01");
  const bEnd = day(b.endDate, "9999-12-31");
  return aStart <= bEnd && bStart <= aEnd;
}

export interface SlotConflict {
  slot: SlotKey;
  sponsor: Pick<PaidSponsor, "id" | "name" | "slug" | "endDate">;
}

/**
 * Exclusivity: the slots `candidate` wants that another holding sponsor
 * already has for overlapping dates. Empty = free to approve.
 */
export function findConflicts(
  candidate: Pick<PaidSponsor, "id" | "tier" | "country" | "trades" | "regions" | "startDate" | "endDate">,
  others: readonly PaidSponsor[],
): SlotConflict[] {
  const wanted = new Map(slotKeys(candidate).map((k) => [slotId(k), k]));
  const out: SlotConflict[] = [];
  for (const o of others) {
    if (o.id === candidate.id || !HOLDING_STATUSES.includes(o.status) || o.country !== candidate.country) continue;
    if (!datesOverlap(candidate, o)) continue;
    for (const k of slotKeys(o)) {
      const hit = wanted.get(slotId(k));
      if (hit) out.push({ slot: hit, sponsor: { id: o.id, name: o.name, slug: o.slug, endDate: o.endDate } });
    }
  }
  return out;
}

export type SlotState = { taken: false } | { taken: true; until: string | null; by: "province" | "national" | "digest" };

/**
 * Is a trade × province slot open (for /advertise)? Web is taken by a
 * province sponsor there; email by a province or digest sponsor there.
 * A national sponsor doesn't block a province slot: the province sponsor
 * takes precedence in its province.
 */
export function slotState(
  q: { country: SponsorCountry; trade: string; region: string | "*"; tier: SponsorTier },
  sponsors: readonly PaidSponsor[],
  today: string,
): SlotState {
  const wanted = new Set(slotKeys({ tier: q.tier, country: q.country, trades: [q.trade], regions: q.region === "*" ? [] : [q.region] }).map(slotId));
  const holders = sponsors.filter(
    (s) =>
      HOLDING_STATUSES.includes(s.status) &&
      s.country === q.country &&
      day(s.endDate, "9999-12-31") >= today &&
      slotKeys(s).some((k) => wanted.has(slotId(k))),
  );
  if (!holders.length) return { taken: false };
  // The latest end date decides when it frees up (null = until cancelled).
  const until = holders.some((s) => !s.endDate) ? null : holders.map((s) => day(s.endDate, "")).sort().at(-1) ?? null;
  return { taken: true, until, by: holders[0].tier };
}

/* ------------------------------------------------------------------ matching */

export interface PaidContext {
  placement: Placement;
  country: SponsorCountry;
  /** Trade slugs or names on the page/email. */
  trades?: string[];
  /** Full province/state name (or code) of the page/email, when it has one. */
  province?: string | null;
  /** True on pages about a province but no one trade (major projects filtered to a province): any trade's sponsor there may show. */
  anyTrade?: boolean;
  /** Stable per page, so rotation between equally good sponsors doesn't flicker. */
  seed?: string;
  /** YYYY-MM-DD; defaults to today (Toronto). */
  today?: string;
}

export function torontoDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Live: approved and inside its dates. */
export function isLive(s: PaidSponsor, today: string): boolean {
  return s.status === "approved" && day(s.startDate, "0000-01-01") <= today && day(s.endDate, "9999-12-31") >= today;
}

/**
 * The one paid sponsor for a page or email, or null. Specific beats broad:
 * a province sponsor in its province, then the trade's national sponsor.
 * Equally good sponsors (only on "any trade" pages) rotate by seed.
 */
export function matchPaidSponsor(ctx: PaidContext, sponsors: readonly PaidSponsor[]): PaidSponsor | null {
  const today = ctx.today ?? torontoDay();
  const channel = channelOf(ctx.placement);
  const trades = new Set((ctx.trades ?? []).map(tradeSlug).filter(Boolean));
  if (!trades.size && !ctx.anyTrade) return null;
  const province = normalizeRegion(ctx.province);
  // A page in the other country's province is a mismatch, never a fallback.
  if (province && regionCountryOf(province) !== ctx.country) return null;

  const scored: { s: PaidSponsor; score: number }[] = [];
  for (const s of sponsors) {
    if (!isLive(s, today) || s.country !== ctx.country) continue;
    if (!TIER_CHANNELS[s.tier].includes(channel)) continue;
    if (!ctx.anyTrade && !s.trades.some((t) => trades.has(t))) continue;
    if (ctx.anyTrade && trades.size && !s.trades.some((t) => trades.has(t))) continue;
    let score = 0;
    if (s.tier === "national") score = 1;
    else if (province && s.regions.includes(province)) score = 2;
    if (score) scored.push({ s, score });
  }
  if (!scored.length) return null;
  // A province sponsor holds its province: the national one only fills where nobody does.
  const best = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best).map((x) => x.s).sort((a, b) => a.slug.localeCompare(b.slug));
  return top[hash(`${ctx.seed ?? ""}|${ctx.placement}`) % top.length];
}

/**
 * The country and province/state an email is "about", for its sponsor slot:
 * the most common among its listings (country first, then the province
 * inside that country). Ties go to the first seen.
 */
export function dominantPlace(items: readonly { province?: string | null; country?: SponsorCountry | null }[]): { country: SponsorCountry; province: string | null } {
  const countries = new Map<SponsorCountry, number>();
  const provinces = new Map<string, number>();
  for (const it of items) {
    const p = normalizeRegion(it.province);
    const c = it.country ?? (p ? regionCountryOf(p) : "CA");
    countries.set(c, (countries.get(c) ?? 0) + 1);
    if (p && regionCountryOf(p) === c) provinces.set(p, (provinces.get(p) ?? 0) + 1);
  }
  const top = <K,>(m: Map<K, number>) => [...m.entries()].reduce<[K, number] | null>((best, e) => (!best || e[1] > best[1] ? e : best), null)?.[0] ?? null;
  const country = top(countries) ?? "CA";
  const province = top(new Map([...provinces].filter(([p]) => regionCountryOf(p) === country)));
  return { country, province };
}

/** The sponsor's copy in the page's language: French on French pages when supplied. */
export function sponsorCopy(s: PaidSponsor, lang: string): { headline: string; message: string; cta: string } {
  if (lang === "fr" && s.headlineFr && s.messageFr) {
    return { headline: s.headlineFr, message: s.messageFr, cta: s.ctaFr || s.cta };
  }
  return { headline: s.headline, message: s.message, cta: s.cta };
}

/* ------------------------------------------------------------------ guardrails */

export const COPY_LIMITS = { headline: 70, message: 180, cta: 28 } as const;

/**
 * Domains of bid/tender aggregators and bid-management platforms that
 * compete with PMRFP. Never sold a slot (policy on /advertise).
 */
export const COMPETITOR_DOMAINS = [
  "merx.com", "biddingo.com", "bidsandtenders.ca", "bidsandtenders.com", "bidnetdirect.com", "bidnet.com",
  "constructconnect.com", "construction.com", "bidclerk.com", "govspend.com", "govwin.com", "bidprime.com",
  "findrfp.com", "rfpmart.com", "rfpdb.com", "tendersontime.com", "globaltenders.com", "demandstar.com",
  "onvia.com", "periscopeholdings.com", "bidsync.com", "isqft.com", "buildingconnected.com", "tenderfinder.ca",
  "canadabids.com", "bidsearch.ca", "planhub.com", "bidmail.com", "seao.ca", "canadabuys.canada.ca",
];

/** Copy that would make a sponsor unit read like a listing on the board. */
const LOOKS_LIKE_A_BID: RegExp[] = [
  /\b(rfp|rfq|rfi|rft|itb|ito)s?\b/i,
  /\brequest for (proposals?|quotations?|quotes?|tenders?|information)\b/i,
  /\b(new|open|current|upcoming|active|live) (tenders?|contracts?|opportunit(y|ies)|solicitations?|bids?)\b/i,
  /\b(closing date|closes (on|in|today|tomorrow)|bid deadline|submission deadline|deadline:|due date)\b/i,
  /\b(solicitation|tender (no|number|#)|contract (no|number|#)|notice of award|awarded to)\b/i,
  /\bnow accepting (bids|proposals|quotes)\b/i,
  /\bappels? d['’]offres?\b/i,
  /\bdate de cl[oô]ture\b/i,
  /\blicitaci[oó]n(es)?\b/i,
];

/** Claims that PMRFP backs the sponsor, or that results are guaranteed. */
const CLAIMS_ENDORSEMENT: RegExp[] = [
  /\bpmrfp\b/i,
  /\b(endorsed|recommended|approved|certified|vetted|verified|preferred|trusted) (by|partner|vendor|supplier)\b/i,
  /\bofficial (partner|sponsor|supplier|provider)\b/i,
  /\b(recommand[ée]e?s? par|approuv[ée]e?s? par|partenaire officiel)\b/i,
  /\bguarantee[ds]? (to )?(win|wins|contracts?|awards?|bids?|work|jobs|results)\b/i,
  /\b(win|land) (every|more|all) (bids?|tenders?|contracts?) guaranteed\b/i,
  /\b100\s?% (win|success|guaranteed)\b/i,
];

/** Copy pitching tender/bid finding: a competing product. */
const COMPETING_PITCH: RegExp[] = [
  /\b(tender|bid|rfp|contract) (alerts?|leads?|search|finder|feeds?|aggregator|notifications?)\b/i,
  /\bfind (more |new |public )?(tenders|bids|rfps|contracts)\b/i,
];

export interface CopyInput {
  name: string;
  url: string;
  headline: string;
  message: string;
  cta: string;
  headlineFr?: string | null;
  messageFr?: string | null;
  ctaFr?: string | null;
  regions?: string[];
}

export type CopyProblem =
  | "name"
  | "url"
  | "competitor"
  | "headline_length"
  | "message_length"
  | "cta_length"
  | "looks_like_bid"
  | "endorsement"
  | "competing_pitch"
  | "french_required"
  | "french_length";

export const COPY_PROBLEM_TEXT: Record<CopyProblem, string> = {
  name: "Add the sponsor's company name.",
  url: "The link must be a full https:// address.",
  competitor: "Bid and tender aggregators compete with PMRFP and can't sponsor.",
  headline_length: `Headline: 1 to ${COPY_LIMITS.headline} characters.`,
  message_length: `Message: 1 to ${COPY_LIMITS.message} characters.`,
  cta_length: `Button text: 1 to ${COPY_LIMITS.cta} characters.`,
  looks_like_bid: "The copy reads like a tender or RFP listing (words such as RFP, tender, closing date). Sponsor units must not look like bids.",
  endorsement: "The copy claims PMRFP's endorsement or guaranteed results. Remove the claim (and PMRFP's name).",
  competing_pitch: "The copy pitches tender or bid finding, which competes with PMRFP.",
  french_required: "Québec placements need the headline and message in French.",
  french_length: "French copy has the same length limits as English.",
};

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isCompetitorUrl(url: string): boolean {
  const host = hostOf(url);
  return !!host && COMPETITOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Everything wrong with a sponsor's copy and link; empty = OK to approve. */
export function checkSponsorCopy(c: CopyInput): CopyProblem[] {
  const out = new Set<CopyProblem>();
  const len = (s: string | null | undefined) => (s ?? "").trim().length;
  if (!len(c.name)) out.add("name");
  if (!hostOf(c.url)) out.add("url");
  else if (isCompetitorUrl(c.url)) out.add("competitor");
  if (!len(c.headline) || len(c.headline) > COPY_LIMITS.headline) out.add("headline_length");
  if (!len(c.message) || len(c.message) > COPY_LIMITS.message) out.add("message_length");
  if (!len(c.cta) || len(c.cta) > COPY_LIMITS.cta) out.add("cta_length");
  const texts = [c.headline, c.message, c.cta, c.headlineFr, c.messageFr, c.ctaFr].filter((t): t is string => !!t);
  const all = texts.join(" \n ");
  if (LOOKS_LIKE_A_BID.some((r) => r.test(all))) out.add("looks_like_bid");
  if (CLAIMS_ENDORSEMENT.some((r) => r.test(`${all} \n ${c.name}`.replace(c.name, "")))) out.add("endorsement");
  if (COMPETING_PITCH.some((r) => r.test(all))) out.add("competing_pitch");
  const quebec = (c.regions ?? []).some((r) => normalizeRegion(r) === "Quebec");
  if (quebec && (!len(c.headlineFr) || !len(c.messageFr))) out.add("french_required");
  if (len(c.headlineFr) > COPY_LIMITS.headline || len(c.messageFr) > COPY_LIMITS.message || len(c.ctaFr) > COPY_LIMITS.cta) out.add("french_length");
  return [...out];
}

/* ------------------------------------------------------------------ where never */

/**
 * Routes that never carry a sponsor unit: dashboards' work areas, admin,
 * sign-in/up, onboarding, pricing, billing and checkout. Paths without the
 * language prefix.
 */
export const EXCLUDED_ROUTES: readonly RegExp[] = [
  /^\/dashboard(\/|$)/,
  /^\/pm-dashboard(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/(sign-in|sign-up|login|signup|register|forgot-password|reset-password|auth|check-email)(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/pricing(\/|$)/,
  /^\/founding-500(\/|$)/,
  /^\/(checkout|billing)(\/|$)/,
  /^\/use-template(\/|$)/,
  /^\/suspended(\/|$)/,
  /^\/advertise(\/|$)/,
];

/** "/fr/rfps/x" → "/rfps/x". */
export function stripLang(path: string): string {
  return path.replace(/^\/(en|fr|es)(?=\/|$)/, "") || "/";
}

export function sponsorAllowedOn(path: string): boolean {
  const p = stripLang(path.split(/[?#]/)[0]);
  return !EXCLUDED_ROUTES.some((r) => r.test(p));
}

/* ------------------------------------------------------------------ input parsing */

export function isPlacement(v: unknown): v is Placement {
  return typeof v === "string" && (PLACEMENTS as readonly string[]).includes(v);
}

export function isSponsorStatus(v: unknown): v is SponsorStatus {
  return typeof v === "string" && (SPONSOR_STATUSES as readonly string[]).includes(v);
}

/** "Acme Bonding Inc." → "acme-bonding-inc" (≤ 40, never a house sponsor's slug). */
export function sponsorSlug(name: string): string {
  const s = tradeSlug(name).slice(0, 40).replace(/-$/, "") || "sponsor";
  return RESERVED_SLUGS.includes(s) ? `${s}-sponsor` : s;
}
