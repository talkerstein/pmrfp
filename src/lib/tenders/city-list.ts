/**
 * Generic parsers for the city flow (lib/tenders/city-sources): the common
 * shapes municipal bid lists come in, driven by each city's config.
 *
 *   html-table  a <table> whose header row names the title and closing date
 *   html-list   repeated blocks (li / div / article), one notice each
 *   rss         an official RSS feed of the list
 *
 * Plus the checks every city run makes before it reads anything: the
 * permission gate (only a "yes" with the matching method runs; a "no" never
 * does), the never-read hosts (commercial bid platforms, BC Bid), and
 * robots.txt. Pure: no fetch here (lib/tenders/city-run does the reading).
 *
 * Rows become rfp_posts in the shape of the other municipal sources: our own
 * one-line summary (never the buyer's documents), the closing date, the
 * buyer's procurement contact and the official link. Identity is the
 * official posting URL (the slug ends `-<marker>-<12 hex of its SHA-1>`).
 */
import type { TenderInsert } from "./canadabuys";
import { cap, publishedAt, slugify } from "./shared";
import { classifyLocalTitle, htmlText, urlRef } from "./local-html";
import { methodFor, type CitySourceConfig, type HtmlItemList, type HtmlTableList, type RssList } from "./city-sources";
import { buyerPermission, hostOf, importAllowed, isBlockedUrl, type PermissionRegistry } from "@/lib/buyers/permissions";
import type { PlatformKey } from "@/lib/buyers/model";

export interface CityRow {
  /** Official posting URL on the buyer's own site. */
  url: string;
  title: string;
  reference: string | null;
  /** YYYY-MM-DD */
  closing: string | null;
  posted: string | null;
  status: string | null;
}

/* ------------------------------------------------------------------ dates */

function ymd(y: string | number, m: string | number, d: string | number): string | null {
  const [Y, M, D] = [Number(y), Number(m), Number(d)];
  if (!Y || M < 1 || M > 12 || D < 1 || D > 31) return null;
  const date = new Date(Date.UTC(Y, M - 1, D));
  if (date.getUTCMonth() !== M - 1) return null; // Feb 30
  return `${Y}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "Nov", "Sept", "November" → 11 / 9 / 11; "Date", "Monday" → 0. */
const monthOf = (word: string) => {
  const w = word.replace(/\.$/, "").toLowerCase();
  return w.length < 3 ? 0 : MONTH_NAMES.findIndex((n) => n.startsWith(w)) + 1;
};

/**
 * A closing date as YYYY-MM-DD from the ways municipal pages write it:
 * 2026-11-03, 2026/11/03, Nov 3, 2026, November 3rd 2026, 3 November 2026,
 * Tuesday, November 3, 2026 at 2:00 PM. Ambiguous numeric dates (03/11/2026)
 * are not guessed.
 */
export function readDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, " ").trim();
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})/);
  if (m) return ymd(m[1], m[2], m[3]);
  m = s.match(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/);
  if (m) return ymd(m[1], m[2], m[3]);
  for (const x of s.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const month = monthOf(x[1]);
    if (month) return ymd(x[3], month, x[2]);
  }
  for (const x of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g)) {
    const month = monthOf(x[2]);
    if (month) return ymd(x[3], month, x[1]);
  }
  return null;
}

/** A table cell's date: a machine-readable attribute first (datetime, data-sort-value), else its text. */
function cellDate(cell: string): string | null {
  const iso = cell.match(/datetime="(\d{4}-\d{2}-\d{2})/);
  if (iso) return readDate(iso[1]);
  const sort = cell.match(/data-sort-value="(\d{4})(\d{2})(\d{2})/);
  if (sort) return ymd(sort[1], sort[2], sort[3]);
  return readDate(htmlText(cell));
}

/** "Closing date: …", "Closes …", "Closing Date and Time - …" (capture 1 = the date text). */
export const DEFAULT_CLOSING = /clos(?:ing|es)(?:\s+date)?(?:\s*(?:and|&)\s*time)?\s*[:\-–]?\s*(?:on\s+)?([^\n|]{6,60})/i;

/* ------------------------------------------------------------------ links */

const decodeHref = (h: string) => h.replace(/&amp;/g, "&").trim();

/** Hosts this city source may read and link as its own (default: the list URL's host, with and without www). */
export function cityHosts(cfg: CitySourceConfig): string[] {
  if (cfg.hosts?.length) return cfg.hosts.map((h) => h.toLowerCase());
  const url = cfg.list.kind === "platform" ? cfg.officialUrl : cfg.list.url;
  const host = hostOf(url);
  if (!host) return [];
  const bare = host.replace(/^www\./, "");
  return [...new Set([host, bare, `www.${bare}`])];
}

/** An official-posting link on the buyer's own site, absolute; null for anything else (platforms, mailto, other sites). */
function ownLink(href: string, base: string, hosts: readonly string[]): string | null {
  try {
    const u = new URL(decodeHref(href), base);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!hosts.includes(u.hostname.toLowerCase())) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const firstLink = (html: string) => html.match(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
const oneLine = (s: string) => htmlText(s).replace(/\s+/g, " ").trim();
const pick = (text: string, re?: RegExp) => (re ? (text.match(re)?.[1] ?? "").replace(/\s+/g, " ").trim() || null : null);
const globalize = (re: RegExp) => (re.flags.includes("g") ? re : new RegExp(re.source, `${re.flags}g`));

/** The <main> element (most CMS pages), else the whole page. */
export function mainOf(html: string): string {
  return html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? html;
}

/* ------------------------------------------------------------------ parsers */

const cellsOf = (row: string) => [...row.matchAll(/<t([hd])\b[^>]*>[\s\S]*?<\/t\1>/gi)].map((m) => m[0]);

export function parseHtmlTable(html: string, list: HtmlTableList, hosts: readonly string[]): CityRow[] {
  const tables = list.table ? [html.match(list.table)?.[0] ?? ""] : [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  for (const table of tables) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    const headAt = Math.max(0, rows.findIndex((r) => /<th\b/i.test(r)));
    const header = cellsOf(rows[headAt] ?? "").map(oneLine);
    const col = (re?: RegExp) => (re ? header.findIndex((h) => re.test(h)) : -1);
    const at = {
      title: col(list.columns.title),
      closing: col(list.columns.closing),
      reference: col(list.columns.reference),
      posted: col(list.columns.posted),
      status: col(list.columns.status),
    };
    if (at.title < 0 || at.closing < 0) continue; // not the bids table
    const out: CityRow[] = [];
    for (const row of rows.slice(headAt + 1)) {
      const cells = cellsOf(row);
      if (cells.length <= Math.max(at.title, at.closing)) continue;
      const link = firstLink(cells[at.title]);
      const url = link ? ownLink(link[1], list.url, hosts) : null;
      if (!link || !url) continue;
      const text = (i: number) => (i >= 0 && cells[i] ? oneLine(cells[i]) || null : null);
      out.push({
        url,
        title: oneLine(link[2]),
        reference: text(at.reference),
        closing: cellDate(cells[at.closing]),
        posted: at.posted >= 0 && cells[at.posted] ? cellDate(cells[at.posted]) : null,
        status: text(at.status),
      });
    }
    return out;
  }
  return [];
}

export function parseHtmlList(html: string, list: HtmlItemList, hosts: readonly string[]): CityRow[] {
  const scope = list.container ? (html.match(list.container)?.[1] ?? "") : mainOf(html);
  const out: CityRow[] = [];
  for (const m of scope.matchAll(globalize(list.item))) {
    const item = m[1] ?? m[0];
    const link = firstLink(item);
    const url = link ? ownLink(link[1], list.url, hosts) : null;
    if (!link || !url) continue;
    const text = htmlText(item);
    out.push({
      url,
      title: oneLine(link[2]),
      reference: pick(text, list.reference),
      closing: readDate(pick(text, list.closing ?? DEFAULT_CLOSING)),
      posted: readDate(pick(text, list.posted)),
      status: pick(text, list.status),
    });
  }
  return out;
}

/** RSS text: CDATA unwrapped, escaped markup decoded, then flattened. */
function rssText(s: string | undefined): string {
  if (!s) return "";
  const raw = s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  const unescaped = /&lt;/.test(raw) ? raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&") : raw;
  return htmlText(unescaped);
}

export function parseRss(xml: string, list: RssList, hosts: readonly string[]): CityRow[] {
  const out: CityRow[] = [];
  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const tag = (name: string) => item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1];
    const title = rssText(tag("title")).replace(/\s+/g, " ").trim();
    const link = rssText(tag("link")) || rssText(tag("guid"));
    const url = link ? ownLink(link, list.url, hosts) : null;
    if (!title || !url) continue;
    const desc = rssText(tag("description"));
    const closing = readDate(pick(desc, list.closing ?? DEFAULT_CLOSING)) ?? readDate(pick(title, DEFAULT_CLOSING));
    const pub = tag("pubDate");
    const posted = pub && !Number.isNaN(Date.parse(rssText(pub))) ? new Date(rssText(pub)).toISOString().slice(0, 10) : null;
    out.push({ url, title, reference: pick(`${title}\n${desc}`, list.reference), closing, posted, status: null });
  }
  return out;
}

/** Rows from a city's list page or feed (a platform-hosted city has none: nothing is read). */
export function parseCityList(body: string, cfg: CitySourceConfig): CityRow[] {
  const hosts = cityHosts(cfg);
  switch (cfg.list.kind) {
    case "html-table":
      return parseHtmlTable(body, cfg.list, hosts);
    case "html-list":
      return parseHtmlList(body, cfg.list, hosts);
    case "rss":
      return parseRss(body, cfg.list, hosts);
    case "platform":
      return [];
  }
}

/* ------------------------------------------------------------------ rows → rfp_posts */

/** PMRFP trade slugs for a row (the shared municipal classifier), or [] to skip. */
export function classifyCityRow(r: CityRow, today: string): string[] {
  if (r.status && /award|cancel|closed|complete|archiv/i.test(r.status)) return [];
  return classifyLocalTitle(r.title, r.closing, today);
}

const LONG_DATE = new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function cityRowToRfpInsert(r: CityRow, cfg: CitySourceConfig, today: string): TenderInsert | null {
  if (!r.title || !r.closing) return null;
  const ref = r.reference ? ` (${r.reference})` : "";
  const closes = LONG_DATE.format(new Date(`${r.closing}T12:00:00Z`));
  return {
    title: cap(r.title, 180),
    slug: `${slugify(r.title).slice(0, 60)}-${cfg.marker}-${urlRef(r.url)}`.replace(/-+/g, "-"),
    // Our own one-line description; the buyer's documents stay on its site.
    summary: `Public tender from ${cfg.buyer}${ref}, ${cfg.province}: ${cap(r.title, 200)}. Closes ${closes}.`,
    scope:
      `${r.title}${ref}.\n\nIssued by ${cfg.issuer} and listed on PMRFP with its permission. ` +
      "The official posting has the documents, addenda and how to submit.",
    requirements: null,
    province: cfg.province,
    deadline: r.closing,
    submission_instructions:
      `Bids go to ${cfg.issuer} as its official posting says, not to PMRFP. Open the official posting for the documents ` +
      "and how to submit. PMRFP does not manage this bid.",
    contact_name: cfg.contact.name,
    contact_email: cfg.contact.email,
    contact_phone: cfg.contact.phone,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: r.url,
    source_notes: `${cfg.buyer}${ref}. ${cfg.copy.en.attribution} Permission registry: ${cfg.buyerSlug}.`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(r.posted, today),
  };
}

/* ------------------------------------------------------------------ the gate */

export type CityGate = { run: true } | { run: false; reason: string };

/**
 * May this city source read anything today? Only a "yes" whose method
 * matches how the source reads; never a "no" (seed refusals can't be
 * overridden, see lib/buyers/permissions); never a platform-hosted list;
 * never a never-read host (bids&tenders, Bonfire, MERX, Biddingo, BC Bid…).
 */
export function citySourceGate(cfg: CitySourceConfig, registry: PermissionRegistry): CityGate {
  const perm = buyerPermission(registry, cfg.buyerSlug);
  if (!perm) return { run: false, reason: "no permission on file" };
  if (perm.status !== "yes") return { run: false, reason: `permission: ${perm.status}` };
  const method = methodFor(cfg.list);
  if (cfg.list.kind === "platform" || !method) {
    return { run: false, reason: `bids hosted on ${cfg.list.kind === "platform" ? cfg.list.platform : "a platform"}: link only, nothing is read` };
  }
  if (!importAllowed(registry, cfg.buyerSlug, method)) return { run: false, reason: `permission method is ${perm.method ?? "none"}, source reads by ${method}` };
  if (isBlockedUrl(cfg.list.url, registry)) return { run: false, reason: `never-read host: ${hostOf(cfg.list.url)}` };
  if (!cityHosts(cfg).includes(hostOf(cfg.list.url) ?? "")) return { run: false, reason: "list URL is not on the buyer's own site" };
  return { run: true };
}

/* ------------------------------------------------------------------ robots.txt */

interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export function parseRobots(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, "").trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      if (value) current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(path: string, rule: string): boolean {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule).split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

/**
 * RFC 9309: the group naming our product token ("pmrfp") if any, else "*";
 * the longest matching rule wins, Allow on a tie; no rule = allowed.
 */
export function robotsAllows(txt: string | null, url: string, token = "pmrfp"): boolean {
  if (!txt) return true;
  const u = new URL(url);
  const path = `${u.pathname}${u.search}`;
  const groups = parseRobots(txt);
  const mine = groups.filter((g) => g.agents.some((a) => a.replace(/\/.*$/, "").trim() === token));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!ruleMatches(path, r.path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

/* ------------------------------------------------------------------ checking a bids page */

/** Hosts of the platforms a bids page can point to (bids hosted there, not on the buyer's site). */
const PLATFORM_HOSTS: [host: string, platform: PlatformKey][] = [
  ["bidsandtenders.ca", "bids-and-tenders"],
  ["bidsandtenders.com", "bids-and-tenders"],
  ["bonfirehub.ca", "bonfire"],
  ["bonfirehub.com", "bonfire"],
  ["biddingo.com", "biddingo"],
  ["merx.com", "merx"],
  ["jaggaer.com", "ontario-tenders-portal"],
  ["bcbid.gov.bc.ca", "bc-bid"],
  ["purchasingconnection.ca", "apc"],
  ["nbon-rpanb.gnb.ca", "nbon"],
  ["sasktenders.ca", "sasktenders"],
  ["ariba.com", "sap-ariba"],
  ["civicinfo.bc.ca", "civicinfo-bc"],
];

export interface BidsPageCheck {
  /** Platform portals the page links to, first one first. */
  platformLinks: { platform: PlatformKey; url: string }[];
  /** Tables whose header names a closing date (a bid list on the page itself). */
  bidTables: number;
  /** "Closing …" mentions with a readable date in the main content. */
  closingDates: number;
  /** Procurement inboxes printed on the page. */
  emails: string[];
  /** Where the bids live: its own page, a platform, or not found. */
  hostedOn: PlatformKey | "own-site" | "unknown";
}

/**
 * What a buyer's bids page actually holds, from one saved copy: a list of its
 * own (table or dated items) or links out to a bid platform. Step 2 of adding
 * a city; also pins Nanaimo's page in its fixture test.
 */
export function inspectBidsPage(html: string): BidsPageCheck {
  const main = mainOf(html);
  const platformLinks: BidsPageCheck["platformLinks"] = [];
  for (const [, href] of main.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const host = hostOf(decodeHref(href));
    const hit = host ? PLATFORM_HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`)) : undefined;
    if (hit && !platformLinks.some((p) => p.url === decodeHref(href))) platformLinks.push({ platform: hit[1], url: decodeHref(href) });
  }
  const bidTables = [...main.matchAll(/<table\b[\s\S]*?<\/table>/gi)].filter((t) => /<th\b[^>]*>[^<]*clos/i.test(t[0])).length;
  const text = htmlText(main);
  const closingDates = [...text.matchAll(new RegExp(DEFAULT_CLOSING.source, "gi"))].filter((m) => readDate(m[1])).length;
  const emails = [...new Set([...main.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => m[1].toLowerCase()))];
  const own = bidTables > 0 || closingDates > 0;
  return {
    platformLinks,
    bidTables,
    closingDates,
    emails,
    hostedOn: own ? "own-site" : platformLinks[0]?.platform ?? "unknown",
  };
}
