/**
 * Recurring forum threads (pure part). What the trade forums showed works
 * (briefs/forum/2026-10-16-trade-forum-study.md): a weekly post of real open
 * bids, "what did it sell for", who won, a winter weather thread per region,
 * and the member prompts ("post a picture of your current job", "what are
 * you working on", polls).
 *
 * Two labelled authors, never a member persona:
 *  - PMRFP Board (system account, "automatic post"): the data threads, built
 *    ONLY from real rows (listings, award notices, price benchmarks). No
 *    data, no thread. No opinions, replies, votes or ratings.
 *  - PMRFP Team (staff account): the weather thread (official forecast LINKS
 *    only, no forecast text) and the member prompts. Replies come from
 *    members; an empty prompt thread just asks.
 *
 * Rules (tested in test/forum-recurring.test.ts):
 *  - idempotent: one thread per series per period (auto_source_key, unique);
 *  - country-scoped: every thread is Canada OR the U.S., never both; the
 *    regional rooms are already one country;
 *  - dated by the database when inserted (never backdated);
 *  - noindex until a member replies (rules.ts isIndexableThread).
 * The DB side lives in recurring-server.ts.
 */
import { SITE } from "@/lib/site";
import { localizePath } from "@/i18n/config";
import forumMessages from "@/i18n/messages/forum";
import { publicTenderSource } from "@/lib/tenders/sources";
import { canonicalProvince, computeBenchmark, provinceCountry, provinceSlug, type BenchmarkAward } from "@/lib/data/price-benchmarks";
import { FORUM_CHANNELS, forumForTrade, roomCountry, roomForProvince, tradeForForum, type ForumCategorySlug, type RoomCountry } from "./categories";
import { AUTO_LABEL_EN, AUTO_LABEL_FR, isOutOfScope, kindOf, type AutoSourceRecord } from "./auto-threads";
import { normalizeBody, normalizeTitle, slugify, wordCount, MAX_BODY } from "./text";
import type { PollDraft } from "./polls";

export const RECURRING_KINDS = ["open-bids", "sold-for", "awards-week", "weather", "prompt", "poll"] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];
export const RECURRING_KEY_PREFIX = "recurring:";

export function isRecurringKind(v: unknown): v is RecurringKind {
  return typeof v === "string" && (RECURRING_KINDS as readonly string[]).includes(v);
}

/** Feature flag: on unless FORUM_RECURRING is explicitly 0/false/off. */
export function recurringEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.FORUM_RECURRING ?? "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(v);
}

/** Most threads one cron run may create (each series is small; this is a backstop). */
export const RUN_CAP = 150;
/** Bid / award / sold-for lists are capped so a post stays readable. */
export const MAX_LIST = 15;
export const MAX_AWARDS_LIST = 30;

export interface RecurringDraft {
  key: string;
  kind: RecurringKind;
  author: "board" | "team";
  category: ForumCategorySlug;
  country: RoomCountry;
  lang: "en" | "fr";
  type: "question" | "discussion";
  title: string;
  slug: string;
  body: string;
  bodyWords: number;
  region: string | null;
  poll?: PollDraft;
}

// ── Periods (Toronto dates, YYYY-MM-DD) ──────────────────────────────
const DAY = 86_400_000;
const utc = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  return ymd(utc(day).getTime() + n * DAY);
}

/** ISO 8601 week ("2026-W42") of a date. */
export function isoWeek(day: string): string {
  const d = utc(day);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(d.getTime() + (3 - dow) * DAY);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY;
  const week = 1 + Math.floor((thursday.getTime() - week1Monday) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday..Sunday of the week containing `day`. */
export function weekBounds(day: string): { from: string; to: string } {
  const dow = (utc(day).getUTCDay() + 6) % 7;
  const from = addDays(day, -dow);
  return { from, to: addDays(from, 6) };
}

/** The calendar month before `day`: key "2026-09" and its first/last day. */
export function previousMonth(day: string): { key: string; from: string; to: string } {
  const [y, m] = day.slice(0, 10).split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const key = `${py}-${String(pm).padStart(2, "0")}`;
  return { key, from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** Winter season key ("2026-27") from November 1 to March 31, else null. */
export function winterSeason(day: string): string | null {
  const [y, m] = day.slice(0, 10).split("-").map(Number);
  if (m >= 11) return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  if (m <= 3) return `${y - 1}-${String(y % 100).padStart(2, "0")}`;
  return null;
}

// ── Formatting ──────────────────────────────────────────────────────
const SITE_BASE = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
const url = (path: string, lang: "en" | "fr") => `${SITE_BASE}${localizePath(path, lang)}`;

function fmtDay(day: string, lang: "en" | "fr", opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return utc(day).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { ...opts, timeZone: "UTC" });
}

/** "Oct 13–19", "Oct 27–Nov 2"; French "13–19 oct.", "27 oct.–2 nov.". */
export function dayRange(from: string, to: string, lang: "en" | "fr"): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  if (lang === "fr") {
    return sameMonth ? `${Number(from.slice(8, 10))}–${fmtDay(to, "fr")}` : `${fmtDay(from, "fr")}–${fmtDay(to, "fr")}`;
  }
  return sameMonth ? `${fmtDay(from, "en")}–${Number(to.slice(8, 10))}` : `${fmtDay(from, "en")}–${fmtDay(to, "en")}`;
}

function monthLabel(key: string, lang: "en" | "fr"): string {
  return fmtDay(`${key}-01`, lang, { month: "long", year: "numeric" });
}

const money = (n: number, currency: string) => `$${Math.round(n).toLocaleString("en-US")} ${currency}`;
const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

const COUNTRY_NAME = { en: { CA: "Canada", US: "United States" }, fr: { CA: "Canada", US: "États-Unis" } } as const;

function roomName(room: ForumCategorySlug, lang: "en" | "fr"): string {
  return forumMessages[lang].categories[room].name;
}

function finish(d: Omit<RecurringDraft, "slug" | "bodyWords" | "title" | "body"> & { title: string; body: string }): RecurringDraft | null {
  const title = normalizeTitle(d.title);
  const body = normalizeBody(d.body).slice(0, MAX_BODY);
  if (title.length < 8 || body.length < 20) return null;
  return { ...d, title, body, slug: slugify(title).slice(0, 80) || "thread", bodyWords: wordCount(body) + wordCount(title) };
}

const boardHead = (lang: "en" | "fr") => `**${lang === "fr" ? AUTO_LABEL_FR : AUTO_LABEL_EN}**`;

// ── 1. Weekly "Open bids this week" (PMRFP Board, real listings) ─────
export interface OpenBid {
  slug: string;
  title: string;
  issuer: string;
  city: string | null;
  /** Canonical province/state name ("Ontario", "Texas"). */
  province: string;
  country: RoomCountry;
  /** Closing date, YYYY-MM-DD. */
  deadline: string;
  /** When it was published on PMRFP, YYYY-MM-DD. */
  published: string;
  /** Trade rooms the listing belongs to (trade forums and General Contractors). */
  rooms: ForumCategorySlug[];
}

/**
 * A real, open, in-scope listing → an OpenBid, or null. Same filters as the
 * per-listing automatic threads (no demo rows, no closed archives, no work a
 * property trade doesn't bid on) plus: a known province/state (for the
 * country) and a closing date (we only say "open" when we know it is).
 */
export function openBidFrom(r: AutoSourceRecord): OpenBid | null {
  if (r.isDemo || r.status !== "published") return null;
  if (r.sourceType === "public_source" && publicTenderSource(r.slug).closedArchive) return null;
  if (kindOf(r) === "award" || isOutOfScope(r)) return null;
  const province = canonicalProvince(r.province);
  const deadline = r.deadline?.slice(0, 10) ?? "";
  const published = (r.publishedAt ?? r.createdAt)?.slice(0, 10) ?? "";
  if (!province || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !/^\d{4}-\d{2}-\d{2}$/.test(published)) return null;
  const title = normalizeTitle(r.title ?? "");
  if (title.length < 4) return null;
  const rooms = [...new Set(r.tradeSlugs.map(forumForTrade).filter((f): f is ForumCategorySlug => f != null))];
  return {
    slug: r.slug,
    title,
    issuer: r.sourceType === "public_source" ? publicTenderSource(r.slug).issuer : "a property manager on PMRFP",
    city: r.city?.trim() || null,
    province,
    country: provinceCountry(province),
    deadline,
    published,
    rooms,
  };
}

/** The issuers publicTenderSource names (English) as they read in a French post. */
const ISSUER_FR: Record<string, string> = {
  "a Quebec public body": "un organisme public québécois",
  "the Government of Canada": "le gouvernement du Canada",
  "a property manager on PMRFP": "un gestionnaire immobilier sur PMRFP",
};

function openBidsBody(room: ForumCategorySlug, country: RoomCountry, bids: OpenBid[], lang: "en" | "fr"): string {
  const fr = lang === "fr";
  const regional = roomCountry(room) != null;
  const scope = regional ? roomName(room, lang) : `${roomName(room, lang)}, ${COUNTRY_NAME[lang][country]}`;
  const shown = bids.slice(0, MAX_LIST);
  const first = bids[0].deadline;
  const last = bids[bids.length - 1].deadline;
  const trade = tradeForForum(room);
  const board = `/rfps?country=${country.toLowerCase()}${trade ? `&category=${trade}` : ""}`;
  const lines = [
    boardHead(lang),
    fr
      ? `Chaque semaine : les appels d'offres et demandes de prix réels publiés sur PMRFP depuis 7 jours et toujours ouverts (${scope}). Construit uniquement à partir des avis; PMRFP n'ajoute aucune réponse, note ni opinion.`
      : `Every week: the real public tenders and RFPs posted on PMRFP in the last 7 days that are still open (${scope}). Built only from the listings; PMRFP adds no replies, ratings or opinions.`,
    fr
      ? `**${bids.length} ${bids.length > 1 ? "appels d'offres ouverts" : "appel d'offres ouvert"}, clôture ${first === last ? `le ${fmtDay(first, "fr")}` : `du ${fmtDay(first, "fr")} au ${fmtDay(last, "fr")}`}**`
      : `**${bids.length} open ${bids.length > 1 ? "bids" : "bid"}, closing ${first === last ? fmtDay(first, "en") : `${fmtDay(first, "en")} to ${fmtDay(last, "en")}`}**`,
    shown
      .map((b) => {
        const where = [b.city, fr && b.province === "Quebec" ? "Québec" : b.province].filter(Boolean).join(", ");
        return fr
          ? `• ${clip(b.title, 140)} — ${ISSUER_FR[b.issuer] ?? b.issuer}, ${where} · clôture le ${fmtDay(b.deadline, "fr")} · ${url(`/rfps/${b.slug}`, lang)}`
          : `• ${clip(b.title, 140)} — ${b.issuer}, ${where} · closes ${fmtDay(b.deadline, "en")} · ${url(`/rfps/${b.slug}`, lang)}`;
      })
      .join("\n"),
  ];
  if (bids.length > shown.length) {
    lines.push(fr ? `Et ${bids.length - shown.length} autres : ${url(board, lang)}` : `And ${bids.length - shown.length} more: ${url(board, lang)}`);
  } else {
    lines.push(fr ? `Tous les appels d'offres ouverts : ${url(board, lang)}` : `All open bids: ${url(board, lang)}`);
  }
  lines.push(
    fr
      ? "Vous soumissionnez sur l'un d'eux ? Questions sur la portée, les visites de site ou l'acheteur : posez-les ici. Chaque avis a aussi son propre fil."
      : "Bidding on one of these? Ask about scope, site visits or the buyer here. Each listing also has its own thread.",
  );
  return lines.join("\n\n");
}

/**
 * One thread per room per country per ISO week: each trade room (per
 * country) and each regional room gets the bids published in the last 7
 * days that are still open. No bids, no thread.
 */
export function planOpenBids(bids: readonly OpenBid[], today: string): RecurringDraft[] {
  const since = addDays(today, -7);
  const week = isoWeek(today);
  const { from, to } = weekBounds(today);
  const groups = new Map<string, { room: ForumCategorySlug; country: RoomCountry; bids: OpenBid[] }>();
  const add = (room: ForumCategorySlug, country: RoomCountry, b: OpenBid) => {
    const k = `${room}|${country}`;
    const g = groups.get(k) ?? { room, country, bids: [] };
    if (!g.bids.some((x) => x.slug === b.slug)) g.bids.push(b);
    groups.set(k, g);
  };
  for (const b of bids) {
    if (b.deadline < today || b.published < since || b.published > today) continue;
    for (const room of b.rooms) add(room, b.country, b);
    const regional = roomForProvince(b.province);
    // A regional room only ever holds its own country's bids.
    if (regional && roomCountry(regional) === b.country) add(regional, b.country, b);
  }
  const out: RecurringDraft[] = [];
  for (const g of groups.values()) {
    g.bids.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title));
    const lang: "en" | "fr" = g.room === "quebec" ? "fr" : "en";
    const regional = roomCountry(g.room) != null;
    const scope = regional ? roomName(g.room, lang) : `${roomName(g.room, lang)}, ${COUNTRY_NAME[lang][g.country]}`;
    const d = finish({
      key: `${RECURRING_KEY_PREFIX}open-bids:${g.room}:${g.country}:${week}`,
      kind: "open-bids",
      author: "board",
      category: g.room,
      country: g.country,
      lang,
      type: "discussion",
      region: regional ? roomName(g.room, "en") : null,
      title: lang === "fr" ? `Appels d'offres ouverts cette semaine : ${scope} (${dayRange(from, to, "fr")})` : `Open bids this week: ${scope} (${dayRange(from, to, "en")})`,
      body: openBidsBody(g.room, g.country, g.bids, lang),
    });
    if (d) out.push(d);
  }
  return out;
}

// ── 2. Monthly "What jobs sold for" (PMRFP Board, price benchmarks) ──
export interface TradeRef {
  slug: string;
  name: string;
}

/**
 * One thread per trade × province per month, in that trade's room: the
 * previous month's awards with a disclosed value. Only where the price
 * benchmark has enough data (n ≥ 5 valued awards in its window; the same
 * gate the benchmark pages use) AND at least one valued award last month.
 * The range itself stays on the benchmark page (Trade Pro).
 */
export function planSoldFor(awards: readonly BenchmarkAward[], trades: readonly TradeRef[], today: string): RecurringDraft[] {
  const month = previousMonth(today);
  const combos = new Map<string, { trade: string; province: string }>();
  for (const a of awards) {
    if (a.amount == null || a.date < month.from || a.date > month.to) continue;
    for (const trade of a.trades) combos.set(`${trade}|${a.province}`, { trade, province: a.province });
  }
  const out: RecurringDraft[] = [];
  for (const { trade, province } of combos.values()) {
    const ref = trades.find((t) => t.name === trade);
    const room = ref ? forumForTrade(ref.slug) : null;
    if (!ref || !room) continue;
    const bench = computeBenchmark(awards, { trade, province }, today);
    if (!bench.enough) continue;
    const rows = bench.awards.filter((a) => a.amount != null && a.date >= month.from && a.date <= month.to).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    if (!rows.length) continue;
    const country = provinceCountry(province);
    const shown = rows.slice(0, MAX_LIST);
    const body = [
      boardHead("en"),
      `Real contract awards from public award notices: ${trade} in ${province}, awarded in ${monthLabel(month.key, "en")}, with the value the buyer disclosed. Built only from the notices; PMRFP adds no opinions.`,
      `**${rows.length} ${rows.length > 1 ? "awards" : "award"} with a disclosed value**`,
      shown
        .map((a) => {
          const who = a.winner ? `Won by ${a.winner}` : "Won by an individual (not named)";
          const buyer = [a.buyer, a.city].filter(Boolean).join(", ");
          return `• ${money(a.amount!, a.currency)} — ${clip(a.title, 120)}.${buyer ? ` ${buyer}.` : ""} Awarded ${fmtDay(a.date, "en")}. ${who}. ${url(`/rfps/${a.slug}`, "en")}`;
        })
        .join("\n"),
      `Over the last 24 months, ${bench.valued} ${trade} contracts in ${province} disclosed a value. The price range for this trade and place: ${url(`/benchmarks/${ref.slug}/${provinceSlug(province)}`, "en")}`,
      "Priced jobs like these? Share what drove the number: scope, access, schedule, materials.",
    ].join("\n\n");
    const d = finish({
      key: `${RECURRING_KEY_PREFIX}sold-for:${ref.slug}:${provinceSlug(province)}:${month.key}`,
      kind: "sold-for",
      author: "board",
      category: room,
      country,
      lang: "en",
      type: "discussion",
      region: province,
      title: `What jobs sold for: ${trade} in ${province} (${monthLabel(month.key, "en")})`,
      body,
    });
    if (d) out.push(d);
  }
  return out;
}

// ── 3. Weekly "Who won public work" (PMRFP Board, award notices) ─────
/**
 * One thread per country per week in Finding work & bids: every award
 * notice dated in the previous Monday-Sunday week, grouped by
 * province/state. Individuals are counted, never named. No awards, no thread.
 */
export function planAwardsWeek(awards: readonly BenchmarkAward[], today: string): RecurringDraft[] {
  const thisWeek = weekBounds(today);
  const from = addDays(thisWeek.from, -7);
  const to = addDays(thisWeek.from, -1);
  const week = isoWeek(today);
  const byCountry = new Map<RoomCountry, BenchmarkAward[]>();
  const seen = new Set<string>();
  for (const a of awards) {
    if (a.date < from || a.date > to || seen.has(a.slug)) continue;
    seen.add(a.slug);
    const list = byCountry.get(a.country) ?? [];
    list.push(a);
    byCountry.set(a.country, list);
  }
  const out: RecurringDraft[] = [];
  for (const [country, list] of byCountry) {
    list.sort((a, b) => a.province.localeCompare(b.province) || (b.amount ?? 0) - (a.amount ?? 0) || a.title.localeCompare(b.title));
    const shown = list.slice(0, MAX_AWARDS_LIST);
    const sections: string[] = [];
    let current = "";
    let rows: string[] = [];
    const flush = () => {
      if (current) sections.push(`**${current}**\n${rows.join("\n")}`);
    };
    for (const a of shown) {
      if (a.province !== current) {
        flush();
        current = a.province;
        rows = [];
      }
      const who = a.winner ?? "An individual (not named)";
      const value = a.amount != null ? money(a.amount, a.currency) : "value not disclosed";
      rows.push(`• ${who} — ${clip(a.title, 110)}.${a.buyer ? ` ${a.buyer}.` : ""} ${value}, awarded ${fmtDay(a.date, "en")}. ${url(`/rfps/${a.slug}`, "en")}`);
    }
    flush();
    const body = [
      boardHead("en"),
      `Every public contract award notice on PMRFP dated ${dayRange(from, to, "en")}, ${COUNTRY_NAME.en[country]} only, by ${country === "US" ? "state" : "province"}. Built only from the notices; companies are named as the buyer published them, individuals are not named.`,
      `**${list.length} ${list.length > 1 ? "awards" : "award"}**`,
      sections.join("\n\n"),
      list.length > shown.length ? `And ${list.length - shown.length} more: ${url("/contract-winners", "en")}` : `Every contract winner: ${url("/contract-winners", "en")}`,
      "Bid on one of these? Share how the pricing landed, or who the buyer was like to work with.",
    ].join("\n\n");
    const d = finish({
      key: `${RECURRING_KEY_PREFIX}awards-week:${country}:${week}`,
      kind: "awards-week",
      author: "board",
      category: "finding-work",
      country,
      lang: "en",
      type: "discussion",
      region: null,
      title: `Who won public work this week: ${COUNTRY_NAME.en[country]} (awarded ${dayRange(from, to, "en")})`,
      body,
    });
    if (d) out.push(d);
  }
  return out;
}

// ── 4. Winter "Weather & storm thread" (PMRFP Team, official links only) ──
const EC = (prov: string) => `https://weather.gc.ca/index_e.html?alertTableFilterProv=${prov}`;
const EC_FR = (prov: string) => `https://meteo.gc.ca/index_f.html?alertTableFilterProv=${prov}`;
const NWS = [
  ["National Weather Service: forecast for your ZIP code or city", "https://www.weather.gov/"],
  ["National Weather Service: active watches, warnings and advisories", "https://www.weather.gov/alerts"],
  ["NOAA Weather Prediction Center: winter weather forecasts", "https://www.wpc.ncep.noaa.gov/wwd/winter_wx.shtml"],
] as const;

/** Official sources per regional room: Environment Canada for Canada, NWS/NOAA for the U.S. Links only. */
export const WEATHER_LINKS: Partial<Record<ForumCategorySlug, readonly (readonly [string, string])[]>> = {
  ontario: [["Environment Canada: weather alerts for Ontario", EC("ON")], ["Environment Canada: forecasts by city", "https://weather.gc.ca/canada_e.html"]],
  quebec: [["Environnement Canada : alertes météo pour le Québec", EC_FR("QC")], ["Environnement Canada : prévisions par ville", "https://meteo.gc.ca/canada_f.html"]],
  alberta: [["Environment Canada: weather alerts for Alberta", EC("AB")], ["Environment Canada: forecasts by city", "https://weather.gc.ca/canada_e.html"]],
  "british-columbia": [["Environment Canada: weather alerts for British Columbia", EC("BC")], ["Environment Canada: forecasts by city", "https://weather.gc.ca/canada_e.html"]],
  prairies: [
    ["Environment Canada: weather alerts for Saskatchewan", EC("SK")],
    ["Environment Canada: weather alerts for Manitoba", EC("MB")],
    ["Environment Canada: forecasts by city", "https://weather.gc.ca/canada_e.html"],
  ],
  atlantic: [
    ["Environment Canada: weather alerts for Nova Scotia", EC("NS")],
    ["Environment Canada: weather alerts for New Brunswick", EC("NB")],
    ["Environment Canada: weather alerts for Prince Edward Island", EC("PE")],
    ["Environment Canada: weather alerts for Newfoundland and Labrador", EC("NL")],
  ],
  "us-northeast": NWS,
  "us-midwest": NWS,
  "us-south": NWS,
  "us-west": NWS,
};

/** Only official government forecast hosts may appear in a weather thread. */
export const OFFICIAL_WEATHER_HOSTS = ["weather.gc.ca", "meteo.gc.ca", "www.weather.gov", "www.wpc.ncep.noaa.gov"] as const;

export function planWeather(today: string): RecurringDraft[] {
  const season = winterSeason(today);
  if (!season) return [];
  const [y1, y2] = season.split("-");
  const out: RecurringDraft[] = [];
  for (const room of FORUM_CHANNELS.regional) {
    const links = WEATHER_LINKS[room];
    const country = roomCountry(room);
    if (!links || !country) continue;
    const fr = room === "quebec";
    const name = roomName(room, fr ? "fr" : "en");
    const body = fr
      ? [
          `Un seul fil pour tout l'hiver ${y1}-20${y2} : tempêtes, déneigement, épandage, appels d'urgence et conditions de chantier au ${name}.`,
          "Pour les prévisions et les avertissements, fiez-vous aux sources officielles ci-dessous. Ce fil ne reproduit pas de prévisions.",
          links.map(([label, href]) => `• ${label} : ${href}`).join("\n"),
          "Dites quand vous partez, ce que vous voyez sur place et l'effet sur votre horaire. Pas d'adresses de clients.",
        ]
      : [
          `One thread for the whole ${y1}–${y2} winter: storms, plowing, salting, callouts and site conditions in ${name}.`,
          "For forecasts and warnings, go to the official sources below. This thread doesn't repost forecasts.",
          links.map(([label, href]) => `• ${label}: ${href}`).join("\n"),
          "Post when you're heading out, what you're seeing on site and what it did to your schedule. No client addresses.",
        ];
    const d = finish({
      key: `${RECURRING_KEY_PREFIX}weather:${room}:${season}`,
      kind: "weather",
      author: "team",
      category: room,
      country,
      lang: fr ? "fr" : "en",
      type: "discussion",
      region: roomName(room, "en"),
      title: fr ? `Météo et tempêtes : ${name}, hiver ${y1}-20${y2}` : `Weather & storm thread: ${name}, winter ${y1}–${y2}`,
      body: body.join("\n\n"),
    });
    if (d) out.push(d);
  }
  return out;
}

// ── 5. Member prompts and polls (PMRFP Team) ─────────────────────────
export const POLLS: readonly { key: string; room: ForumCategorySlug; question: string; options: readonly string[] }[] = [
  {
    key: "bid-costs",
    room: "pricing-estimating",
    question: "Which costs you the most on bids?",
    options: ["Material prices moving after I bid", "Labour and crew time", "Change orders I don't get paid for", "Waiting to get paid", "Bid prep on jobs I don't win", "Bonding and insurance"],
  },
  {
    key: "find-work",
    room: "finding-work",
    question: "Where does most of your commercial work come from?",
    options: ["Public tenders", "Repeat clients", "GC bid invitations", "Referrals", "Property managers I know", "Online listings"],
  },
  {
    key: "paid-days",
    room: "getting-paid",
    question: "How long does a typical commercial invoice take to get paid?",
    options: ["Under 30 days", "30 to 45 days", "45 to 60 days", "60 to 90 days", "Over 90 days"],
  },
  {
    key: "phones",
    room: "running-the-business",
    question: "Who answers your phone while you're on the job?",
    options: ["I do", "Office staff", "A family member", "An answering service", "A virtual assistant", "Voicemail"],
  },
];

/** The poll for a month: rotates through POLLS so each question comes back every few months. */
export function pollFor(day: string): (typeof POLLS)[number] {
  const [y, m] = day.split("-").map(Number);
  return POLLS[(y * 12 + (m - 1)) % POLLS.length];
}

export function planPrompts(today: string): RecurringDraft[] {
  const week = isoWeek(today);
  const { from } = weekBounds(today);
  const month = monthKey(today);
  const out: RecurringDraft[] = [];
  const poll = pollFor(today);
  for (const country of ["CA", "US"] as const) {
    const where = COUNTRY_NAME.en[country];
    const drafts = [
      finish({
        key: `${RECURRING_KEY_PREFIX}prompt:waywo:${country}:${week}`,
        kind: "prompt",
        author: "team",
        category: "show-your-work",
        country,
        lang: "en",
        type: "discussion",
        region: null,
        title: `What are you working on this week? (${where}, week of ${fmtDay(from, "en")})`,
        body: [
          `The weekly check-in for ${where}. What's on the schedule: the job, the trade, the town, what's going well and what's fighting you.`,
          "Add a photo if you have one (no client faces, addresses or unit numbers). A new thread starts every Monday.",
        ].join("\n\n"),
      }),
      finish({
        key: `${RECURRING_KEY_PREFIX}prompt:photo:${country}:${month}`,
        kind: "prompt",
        author: "team",
        category: "show-your-work",
        country,
        lang: "en",
        type: "discussion",
        region: null,
        title: `Post a picture of your current job (${where}, ${monthLabel(month, "en")})`,
        body: [
          `Show the work. One or more photos of the job you're on right now in ${where}, with a line on what it is: the trade, the building type, the problem you solved.`,
          "Use the photo button under the reply box (up to 4 per reply; location data is removed). Only post photos you took or have permission to share, and leave out client faces, addresses and unit numbers.",
        ].join("\n\n"),
      }),
      finish({
        key: `${RECURRING_KEY_PREFIX}poll:${poll.key}:${country}:${month}`,
        kind: "poll",
        author: "team",
        category: poll.room,
        country,
        lang: "en",
        type: "discussion",
        region: null,
        title: `Poll: ${poll.question} (${where}, ${monthLabel(month, "en")})`,
        body: [
          `This month's poll for ${where}: ${poll.question}`,
          "One vote per verified member; results show once you've voted. Tell us why in a reply.",
        ].join("\n\n"),
      }),
    ];
    for (const d of drafts) {
      if (!d) continue;
      out.push(d.kind === "poll" ? { ...d, poll: { question: poll.question, options: [...poll.options] } } : d);
    }
  }
  return out;
}

// ── Everything for a run ────────────────────────────────────────────
export interface RecurringInputs {
  today: string;
  bids: readonly OpenBid[];
  awards: readonly BenchmarkAward[];
  trades: readonly TradeRef[];
  kinds?: readonly RecurringKind[];
}

/** Every draft due today, minus the ones already posted (`existing` keys), capped. */
export function planRecurring(input: RecurringInputs, existing: ReadonlySet<string>, cap = RUN_CAP): RecurringDraft[] {
  const want = new Set(input.kinds ?? RECURRING_KINDS);
  const all = [
    ...(want.has("open-bids") ? planOpenBids(input.bids, input.today) : []),
    ...(want.has("awards-week") ? planAwardsWeek(input.awards, input.today) : []),
    ...(want.has("sold-for") ? planSoldFor(input.awards, input.trades, input.today) : []),
    ...(want.has("weather") ? planWeather(input.today) : []),
    ...(want.has("prompt") || want.has("poll") ? planPrompts(input.today).filter((d) => want.has(d.kind)) : []),
  ];
  const seen = new Set(existing);
  const out: RecurringDraft[] = [];
  for (const d of all) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    out.push(d);
  }
  return out.slice(0, Math.max(0, cap));
}
