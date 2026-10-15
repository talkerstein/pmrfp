/**
 * Periscope S2G / BuySpeed public bid boards (".../bso/") → PMRFP
 * public-tender feed. Configured per site in ./periscope-sites; only COMMBUYS
 * (Massachusetts) is enabled.
 *
 * COMMBUYS lists every open bid from state agencies, cities and towns, school
 * districts and housing authorities. The public "open bids" search needs no
 * login, and its results table has the platform's own "Export to CSV File"
 * button: one GET for the search page (session cookie + JSF view state), one
 * POST for the CSV — the whole open list (~900 rows) in two requests. The CSV
 * has the bid number, organization, title, bid opening (closing) date and
 * status. robots.txt (redirected to periscopeholdings.com) only disallows
 * /craft. MA's Operational Services Division confirmed on 2026-10-09 that no
 * permission is needed to use the public data.
 *
 * New building-trade bids are then read from their public detail page
 * (bidDetail.sda, the bid's own URL) for the bid type, department, posting
 * date and the buyer's bulletin text — at most MAX_DETAILS a run, 2.5 s
 * apart; the rest wait for the next day's run. No documents are downloaded.
 *
 * Kept: bids still open for responses (status "Sent", future closing date)
 * whose title names building or facility work.
 *
 * Pure apart from fetchPeriscopeOpenBids() / fetchPeriscopeDetail(); the cron
 * route owns the writes.
 */
import type { TenderInsert } from "./canadabuys";
import { CIVIL, EXCLUDE, cap, clean, publishedAt, slugify, tradesFor } from "./shared";
import { parseCsv } from "./csv";
import { TENDER_UA } from "./florida-vbs";
import type { PeriscopeSite } from "./periscope-sites";

/** Polite pacing between requests to one board. */
export const REQUEST_DELAY_MS = 2_500;
/** Detail pages read per run (new bids only). */
export const MAX_DETAILS = 60;

export interface PeriscopeBid {
  /** "BD-27-1167-PUR02-PUR01-134522" */
  number: string;
  /** Final all-digit sequence of the bid number — the slug reference. */
  seq: string;
  organization: string;
  title: string;
  /** YYYY-MM-DD bid opening date (responses are due by then). */
  closing: string | null;
  status: string;
  alternateId: string;
}

export interface PeriscopeDetail {
  department: string;
  bidType: string;
  purchaseMethod: string;
  /** YYYY-MM-DD the bid was made available. */
  available: string | null;
  bulletin: string;
  preBid: string;
}

export const searchUrl = (site: PeriscopeSite) => `${site.base}/bso/view/search/external/advancedSearchBid.xhtml?openBids=true`;
export const detailUrl = (site: PeriscopeSite, number: string) =>
  `${site.base}/bso/external/bidDetail.sda?docId=${encodeURIComponent(number)}&external=true&parentUrl=close`;

/** "11/10/2026 2:00 PM" or "10/29/2026 02:00:00 PM" → "2026-11-10". */
export function periscopeDate(s: string | null | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/**
 * The CSV export double-encodes non-ASCII punctuation and loses bytes on the
 * way ("School Ã?Â¢Ã?Â?Ã?Â? Prequal", "Authority�??s"). A spaced run was a
 * dash, a run inside a word was an apostrophe.
 */
export function repairPeriscopeText(s: string): string {
  return s
    .replace(/(\s?)(?:[ÃÂâ�][\u0080-¿?�ÃÂ]*)+(\s?)/g, (_, a: string, b: string) => (a && b ? " – " : a || b ? " " : "'"))
    .replace(/\s+/g, " ")
    .trim();
}

const text = (s: string | undefined) => repairPeriscopeText(clean(s ?? ""));

/** Standard bid documents only ("BD-…"); legacy "S12345-vCurrent" notices have no bid detail page. */
export const BID_NUMBER = /^BD-\d{2}-[A-Z0-9]+(?:-[A-Z0-9]+)*-(\d+)$/i;

export function parsePeriscopeCsv(csv: string): PeriscopeBid[] {
  const out = new Map<string, PeriscopeBid>();
  for (const r of parseCsv(csv)) {
    const number = clean(r["Bid Solicitation #"] ?? "").toUpperCase();
    const seq = BID_NUMBER.exec(number)?.[1];
    if (!seq) continue;
    out.set(number, {
      number,
      seq,
      organization: text(r["Organization Name"]),
      title: text(r["Description"]),
      closing: periscopeDate(r["Bid Opening Date"]),
      status: clean(r["Status"] ?? ""),
      alternateId: text(r["Alternate Id"]),
    });
  }
  return [...out.values()];
}

/** "1-25 of 909" on the search page — what the CSV should add up to. */
export function periscopeOpenTotal(html: string): number | null {
  const m = html.match(/ui-paginator-current">\s*\d+-\d+ of ([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** The form fields the results form posts back, plus its CSV export command. */
export function exportForm(html: string): URLSearchParams | null {
  const start = html.indexOf('<form id="bidSearchResultsForm"');
  if (start < 0) return null;
  const form = html.slice(start, html.indexOf("</form>", start));
  const button = form.match(/title="Export to CSV File"[^>]*jsfcljs\([^,]+,\{'([^']+)'/)?.[1];
  if (!button) return null;
  const body = new URLSearchParams();
  for (const [input] of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = input.match(/name="([^"]+)"/)?.[1];
    const value = input.match(/value="([^"]*)"/)?.[1] ?? "";
    if (name && !body.has(name)) body.set(name, value.replace(/&amp;/g, "&"));
  }
  if (!body.has("javax.faces.ViewState")) return null;
  body.set(button, button);
  return body;
}

function decode(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n");
}

/** Header fields of a bid detail page (label cell → the value cell after it). */
export function parsePeriscopeDetail(html: string): PeriscopeDetail | null {
  const fields = new Map<string, string>();
  for (const m of html.matchAll(/<td[^>]*class="?t-head-01"?[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
    const label = decode(m[1]).replace(/\s+/g, " ").replace(/\s*:\s*$/, "").trim().toLowerCase();
    if (label && !fields.has(label)) fields.set(label, repairPeriscopeText(clean(decode(m[2]))));
  }
  if (!fields.has("bid number")) return null;
  const get = (k: string) => fields.get(k) ?? "";
  return {
    department: get("department").replace(/^[A-Z0-9]+ - /, ""),
    bidType: get("bid type"),
    purchaseMethod: get("purchase method"),
    available: periscopeDate(get("available date")),
    bulletin: get("bulletin desc"),
    preBid: get("pre bid conference"),
  };
}

// Utility, road, site-civil, plant and grant notices, and buys no building
// trade bids on, that the shared EXCLUDE/CIVIL miss in COMMBUYS titles.
const PERISCOPE_SKIP =
  /water ?main|water ?line|wastewater|water treatment|water pollution|pump station|lift stations?|drainage|storm ?water|culverts?|\bdam\b|streetscape|sidewalk|roadway|street (?:improvement|reconstruction|resurfac|paving)|(?:avenue|street|corner|square) (?:reconstruction|improvements)|town roads|road (?:maintenance|drainage|reclamation|improvements?|reconstruction|resurfacing|service)|intersection|traffic|pavement marking|line striping|crack seal|\bi-\d+\b|interstate|catch basin|manhole|\bwells?\b|clarifiers?|\bgrit\b|dredg|harbou?r|seawall|\bpier\b|boat ramp|\btrail\b|playground|athletic|ball ?field|basketball|batting cage|dugout|bleachers|\bpool\b|turf|tennis|pickleball|hot[- ]mix|paving (?:program|materials)|solar|electric vehicle|\bevse\b|\bev charg|\btow\b|towing|roadside|uniforms?|\bfood\b|meals|vending|rifle|firearm|ammunition|furniture|textbooks?|printing|software|audit|actuarial|legal services|insurance|banking|owner'?s project manager|\bopm\b|project manag|clerk of the works|commissioning|appraisal|survey|feasibility|\bgrants?\b|\bnofa\b|funding|request for applications|\brfa\b|hospital|\bvessel|marine|\bsalt\b|fuel|heating oil|propane|natural gas|electricity supply|energy (?:supply|broker)|street ?light|tree planting|wildfire|protection plan|remote terminal|\bsale of\b|disposition|lease of|engineering design|design (?:services|project)|designer|\bfap\b|widening|appliance|turbine|demonstration|filling station|trailer|equipment,? parts|parts,? (?:and )?equipment/;

// A goods buy ("Purchase of…", "…Equipment", "…Supplies") is kept only when
// the title also names the labour ("Purchase and Installation of…").
const GOODS = /\bpurchase\b|\bsupplies\b|\bsupply\b|equipment\b|\bvehicles?\b|\btrucks?\b|\bparts\b|materials\b/;
const LABOUR = /install|repair|maint|service|replac|renovat|construct|plow|removal/;

// Building work COMMBUYS titles name in their own words, on top of the shared RULES.
const PERISCOPE_RULES: [slug: string, pattern: RegExp][] = [
  ["snow-removal", /snow (?:and|&) ice|snow plowing|snow hauling/],
  ["hvac", /\bhvacr\b|hydronic|glycol|\brtu\b|rooftop units?|air handl|bath(?:room)? fans?|exhaust fans?/],
  ["plumbing", /shower|tub replacement|bath ?tubs?|valves? replacement|victaulic/],
  ["electrical", /lighting|light replacement|emergency lights|transformer|uninterrupt/],
  ["glass-and-windows", /replacement windows|windows? (?:replace|upgrade)/],
  ["garage-doors", /bay doors?/],
  ["security-systems", /security (?:equipment|door)|door control/],
  ["pest-control", /pest management/],
  ["waste-removal", /rubbish|trash (?:and recycling )?(?:removal|collection)/],
  ["flooring", /resilient floor/],
  ["waterproofing", /water leaks?|water infiltration/],
  ["concrete-and-asphalt", /hardscape/],
  ["property-maintenance", /tradesperson|facility repairs/],
  [
    "general-contracting",
    /trade contractors?|filed sub|sub[- ]?trades|trade packages?|construction management at risk|\bcm at risk|\bcmar\b|\bnew [a-z/ ]{0,24}school\b|siding|(?:entry|exit|porch|exterior|entrance|storm) doors?|turnover|accessibility (?:improvements|and compliance|upgrades)|stair repairs?|brehabb|building (?:&|and) site improvements|building improvements|occupancy upgrades?/,
  ],
];

/**
 * Lower-cased title as the filters read it: place names that contain a CIVIL
 * keyword ("Cambridge", "Bridgewater", "Broadway") are masked, and "testing"
 * is dropped from maintenance contracts ("Fire Alarm Testing, Maintenance &
 * Repair") so the shared EXCLUDE doesn't read them as lab work.
 */
function filterText(title: string): string {
  const t = title.toLowerCase().replace(/\b[a-z]+bridge\b|\bbridgewater\b|broadway/g, "~");
  return /maint|repair/.test(t) ? t.replace(/\btesting\b/g, "") : t;
}

/** PMRFP trade slugs (max 3), or [] to skip. */
export function classifyPeriscope(b: PeriscopeBid, today: string): string[] {
  if (b.status !== "Sent" || !b.closing || b.closing < today) return [];
  const title = filterText(b.title);
  if (title.length < 6 || EXCLUDE.test(title) || CIVIL.test(title) || PERISCOPE_SKIP.test(title)) return [];
  if (GOODS.test(title) && !LABOUR.test(title)) return [];
  const own = PERISCOPE_RULES.filter(([, p]) => p.test(title)).map(([slug]) => slug);
  return [...new Set([...tradesFor(title), ...own])].slice(0, 3);
}

export function periscopeToRfpInsert(site: PeriscopeSite, b: PeriscopeBid, today: string, d: PeriscopeDetail | null = null): TenderInsert | null {
  if (!b.title || !b.closing) return null;
  const title = cap(b.title, 180);
  const buyer = b.organization || `a ${site.state} public body`;
  const dept = d?.department && d.department.toLowerCase() !== buyer.toLowerCase() ? d.department : "";
  const issuer = dept ? `${buyer} (${dept})` : buyer;
  const about = d?.bulletin && d.bulletin.length > 20 ? d.bulletin : "";
  const kind = [d?.bidType && `${d.bidType.charAt(0)}${d.bidType.slice(1).toLowerCase()} bid`, d?.purchaseMethod].filter(Boolean).join(" · ");
  return {
    title,
    slug: `${slugify(b.title).slice(0, 60)}-${site.marker}-${b.seq}`.replace(/-+/g, "-"),
    summary: `${site.state}. ${issuer}: ${cap((about || title).replace(/\s+/g, " "), 240)}`,
    scope: [
      `Bid ${b.number}${b.alternateId ? ` (${b.alternateId})` : ""} — ${b.title}.`,
      kind ? `Bid type: ${kind}.` : "",
      d?.preBid ? `Pre-bid conference: ${d.preBid}.` : "",
      about,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000),
    requirements: null,
    province: site.state,
    deadline: b.closing,
    submission_instructions:
      `This is a public ${site.state} bid (${b.number}) issued by ${issuer} on ${site.portal}. ` +
      "Open the official bid page for the documents, addenda, contact and how to respond; responses go to the " +
      "issuing organization as the bid specifies. PMRFP does not manage this bid.",
    // Buyer contacts stay on the official bid page.
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: detailUrl(site, b.number),
    source_notes: `${site.portal} ${b.number} · ${issuer}. ${site.attribution}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(d?.available, today),
  };
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    });
  });

/** Cookie jar for the anonymous JSF session. */
function keepCookies(res: Response, jar: Map<string, string>) {
  const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of lines) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

export interface PeriscopeOpenList {
  bids: PeriscopeBid[];
  /** The search page's own open-bid count. */
  total: number | null;
}

/** Two requests: the open-bid search page, then its CSV export. */
export async function fetchPeriscopeOpenBids(site: PeriscopeSite, signal?: AbortSignal, delayMs = REQUEST_DELAY_MS): Promise<PeriscopeOpenList> {
  const jar = new Map<string, string>();
  const page = await fetch(searchUrl(site), { cache: "no-store", signal, headers: { "User-Agent": TENDER_UA } });
  if (!page.ok) throw new Error(`${site.portal} search page failed: HTTP ${page.status}`);
  keepCookies(page, jar);
  const html = await page.text();
  const body = exportForm(html);
  if (!body) throw new Error(`${site.portal}: CSV export form not found on the search page`);
  const total = periscopeOpenTotal(html);

  await sleep(delayMs, signal);
  const res = await fetch(`${site.base}/bso/view/search/external/advancedSearchBid.xhtml`, {
    method: "POST",
    cache: "no-store",
    signal,
    headers: {
      "User-Agent": TENDER_UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: searchUrl(site),
      Cookie: cookieHeader(jar),
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`${site.portal} CSV export failed: HTTP ${res.status}`);
  if (!/csv/i.test(res.headers.get("content-type") ?? "")) throw new Error(`${site.portal} CSV export returned ${res.headers.get("content-type")}`);
  const bids = parsePeriscopeCsv(await res.text());
  // A short export (session hiccup, partial file) must not archive the rest.
  if (total && bids.length < total * 0.8) throw new Error(`${site.portal}: CSV has ${bids.length} bids, search page says ${total}`);
  return { bids, total };
}

export async function fetchPeriscopeDetail(site: PeriscopeSite, number: string, signal?: AbortSignal): Promise<PeriscopeDetail | null> {
  const res = await fetch(detailUrl(site, number), { cache: "no-store", signal, headers: { "User-Agent": TENDER_UA } });
  if (!res.ok) return null;
  return parsePeriscopeDetail(await res.text());
}
