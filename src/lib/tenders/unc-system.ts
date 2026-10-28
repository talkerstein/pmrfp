/**
 * UNC System Office "Opportunities to Do Business with the Universities" →
 * PMRFP public-tender feed (North Carolina, all 17 campuses).
 *
 * northcarolina.edu/apps/finance/vendors/opportunities.htm is the UNC
 * System's own capital-projects board: construction bids, bids from
 * prequalified contractors, design-build and construction-manager-at-risk
 * solicitations from every campus, each with a public detail page (pre-bid,
 * bid opening, location, description and budget when the campus gives one).
 * The campuses' construction work is NOT on NC eVP (that is goods/services),
 * so this adds bids eVP does not carry — and any bid that does appear on both
 * is dropped here (see ncEvpDuplicate).
 *
 * Politeness: robots.txt is read first and honoured (it only disallows
 * /wp-content/ and /wp-admin/); one read of the list page, then one read per
 * NEW listing's detail page, a second apart; identified as PMRFP-TenderFeed.
 * No terms-of-use page was found (checked 2026-10-28). The notices are public
 * records of a North Carolina public body. The designer-solicitation
 * (A/E selection) and public-meeting categories are not read — those are not
 * work a contractor bids on. Contacts stay on the official notice.
 *
 * Pure apart from the fetch* functions; the cron route owns the writes.
 */
import type { TenderInsert } from "./canadabuys";
import type { Candidate, Source } from "./sync";
import { cap, clean, publishedAt, slugify, tradesFor } from "./shared";
import { htmlText, sleep } from "./local-html";
import { robotsAllows } from "./city-list";
import { fetchNcEvpOpen, type NcEvpBid } from "./nc-evp";
import { UNC_SYSTEM_ATTRIBUTION } from "./us-state-sources";

export const UNC_UA = "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)";
const UNC_ORIGIN = "https://www.northcarolina.edu";
export const UNC_LIST_URL = `${UNC_ORIGIN}/apps/finance/vendors/opportunities.htm`;
export const UNC_ROBOTS_URL = `${UNC_ORIGIN}/robots.txt`;
/** Stable per listing: the id alone opens the notice, whichever category it moves to. */
export const uncDetailUrl = (id: string) => `${UNC_LIST_URL}?mode=view&id=${id}`;

/** The categories a contractor bids on (designer solicitations and public meetings are left out). */
export const UNC_CATEGORIES: Record<string, string> = {
  bid_solicit: "Construction bid",
  bidpre_solicit: "Construction bid, prequalified contractors",
  db_risk: "Design-build solicitation",
  cm_risk: "Construction manager-at-risk solicitation",
};

export interface UncBid {
  /** Numeric id of the notice on northcarolina.edu. */
  id: string;
  /** Category code (a key of UNC_CATEGORIES). */
  code: string;
  campus: string;
  project: string;
  /** YYYY-MM-DD */
  posted: string | null;
  /** YYYY-MM-DD: bid opening, or the proposal closing date for design-build and CM-at-risk. */
  closing: string | null;
}

/** "10/29/26" or "10/29/2026" → "2026-10-29". */
export function uncDate(s: unknown): string | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** Every listing in the construction categories of the list page. */
export function parseUncList(html: string): UncBid[] {
  const out = new Map<string, UncBid>();
  for (const row of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const link = row.match(/href='[^']*\?mode=view&(?:amp;)?code=([a-z_]+)&(?:amp;)?id=(\d+)'[^>]*>([\s\S]*?)<\/a>/);
    if (!link || !(link[1] in UNC_CATEGORIES)) continue;
    const cells = new Map<string, string>();
    for (const c of row.matchAll(/<td headers="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)) cells.set(c[1], htmlText(c[2]).replace(/\s+/g, " "));
    const project = clean(htmlText(link[3]).replace(/\s+/g, " "));
    const campus = clean(cells.get("University") ?? "");
    if (!project || !campus) continue;
    out.set(link[2], {
      id: link[2],
      code: link[1],
      campus,
      project,
      posted: uncDate(cells.get("Initial Posting")),
      closing: uncDate(cells.get("Closing") ?? cells.get("Bid Date") ?? cells.get("Due Date")),
    });
  }
  return [...out.values()];
}

/** A detail page's label → value table (text, whitespace collapsed). */
export function parseUncDetail(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const row of html.match(/<tr id='df\.fin_ads\.[a-z_]+'[\s\S]*?<\/tr>/g) ?? []) {
    const key = row.match(/<tr id='df\.fin_ads\.([a-z_]+)'/)?.[1];
    const value = row.match(/<td class='df_field' [^>]*>([\s\S]*?)<\/td><td>(?:&nbsp;)?<\/td><\/tr>/)?.[1];
    if (!key || value == null) continue;
    const text = clean(htmlText(value).replace(/\s+/g, " "));
    if (text) fields.set(key, text);
  }
  return fields;
}

// Work the shared trade rules miss on a campus capital-projects board.
const UNC_RULES: [slug: string, pattern: RegExp][] = [
  ["hvac", /\bbas\b|building automation|steam|chilled water|heating\/hot water|hot water/],
  ["electrical", /substation|power and light|solar|photovoltaic|\bpv\b|lighting/],
  ["concrete-and-asphalt", /resurfac|parking lot|\bparking (?:deck|structure)s?\b.*(?:repair|restor)|sidewalk|paving/],
  ["elevator-services", /elevator/],
  ["roofing", /roof/],
];

/** PMRFP trade slugs (max 3) for a listing, or [] to skip. */
export function classifyUnc(b: UncBid, today: string): string[] {
  if (!(b.code in UNC_CATEGORIES) || !b.closing || b.closing < today) return [];
  const t = b.project.toLowerCase().replace(/\s+/g, " ");
  if (t.length < 6) return [];
  const slugs = new Set(tradesFor(t));
  for (const [slug, p] of UNC_RULES) if (p.test(t)) slugs.add(slug);
  // Every listing here is capital construction, so an unnamed trade is general contracting.
  if (!slugs.size) slugs.add("general-contracting");
  return [...slugs].slice(0, 3);
}

/** The form's own prompt leaks into some descriptions ("One-Two Sentences …"). */
const descriptionOf = (d: Map<string, string>) =>
  (d.get("proj_desc") ?? d.get("preq_for") ?? "").replace(/^one[- ]?(?:to[- ])?two sentences\s*/i, "").trim();

const budgetOf = (d: Map<string, string>) => {
  const b = d.get("proj_budget") ?? "";
  return b && !/^(none|n\/?a|tbd|-+)$/i.test(b) ? b : "";
};

export function uncToRfpInsert(b: UncBid, detail: Map<string, string> | null, today: string): TenderInsert | null {
  if (!b.project || !b.closing) return null;
  const d = detail ?? new Map<string, string>();
  const kind = UNC_CATEGORIES[b.code] ?? "Solicitation";
  const title = cap(`${b.campus}: ${b.project}`, 180);
  const description = descriptionOf(d);
  const budget = budgetOf(d);
  const about = description.length > 20 ? description : b.project;

  const preBid = [d.get("pre_bid_date"), d.get("pre_bid_time")].filter(Boolean).join(" ");
  const where = d.get("pre_loc");
  const due = [d.get("bid_date") ?? d.get("due_date") ?? d.get("close_date"), d.get("bid_time")].filter(Boolean).join(" ");
  const lines = [
    `${kind} — ${b.campus}.`,
    about === b.project ? "" : b.project,
    description,
    budget ? `Project budget: ${budget}` : "",
    preBid ? `Pre-bid / pre-proposal: ${preBid}${where ? ` (${where})` : ""}` : "",
    due ? `Bids due / opened: ${due}` : "",
    d.get("bid_loc") ? `Bid location: ${d.get("bid_loc")}` : d.get("submit_to") ? `Submit to: ${d.get("submit_to")}` : "",
  ].filter(Boolean);

  return {
    title,
    slug: `${slugify(`${b.campus} ${b.project}`).slice(0, 60)}-uncs-${b.id}`.replace(/-+/g, "-"),
    summary: `North Carolina. ${b.campus} (${kind.toLowerCase()}): ${cap(about, 240)}${budget ? ` Budget ${budget}.` : ""}`,
    scope: lines.join("\n\n").slice(0, 8000),
    requirements: null,
    province: "North Carolina",
    deadline: b.closing,
    submission_instructions:
      `This is a public University of North Carolina System solicitation issued by ${b.campus}. ` +
      "Open the official notice for the pre-bid date, plans and addenda, and how to submit; " +
      "bids go to the campus or its design firm as the notice specifies. PMRFP does not manage this bid.",
    // Project managers and design firms are named on the official notice only.
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: uncDetailUrl(b.id),
    source_notes: `UNC System Office notice ${b.id} · ${b.campus} · ${kind}. ${UNC_SYSTEM_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(b.posted, today),
  };
}

// ---------------------------------------------------------------- dedupe vs NC eVP

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Solicitation-style numbers ("26-1234", "PRJ-24-0031") named in a title. */
const numbersIn = (s: string): string[] =>
  [...s.matchAll(/\b(?:[a-z]{1,4}-?)?\d{2,4}-\d{3,}(?:-\d+)?\b/gi)].map((m) => m[0].toLowerCase());

/**
 * True when an open NC eVP solicitation is this same project: eVP's title
 * contains the UNC project name (or the reverse, for a full-sentence name),
 * or both name the same solicitation number. UNC campuses post goods and
 * services on eVP; a capital project listed on both boards must not become
 * two listings.
 */
export function ncEvpDuplicate(b: UncBid, evp: Pick<NcEvpBid, "number" | "title">[]): boolean {
  const project = norm(b.project);
  const nums = numbersIn(b.project);
  return evp.some((e) => {
    const title = norm(e.title);
    if (project.length >= 12 && title.includes(project)) return true;
    if (title.length >= 15 && project.includes(title)) return true;
    const evpNums = new Set([...numbersIn(e.title), ...numbersIn(e.number)]);
    return nums.some((n) => evpNums.has(n));
  });
}

// ---------------------------------------------------------------- fetching

async function get(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { cache: "no-store", signal, headers: { "User-Agent": UNC_UA, Accept: "text/html,application/xhtml+xml" } });
  if (!res.ok) throw new Error(`UNC System: HTTP ${res.status} (${url})`);
  return res.text();
}

/** robots.txt first; throws when it says no (or can't be read), so nothing is fetched. */
export async function assertUncAllowed(signal?: AbortSignal): Promise<void> {
  const res = await fetch(UNC_ROBOTS_URL, { cache: "no-store", signal, headers: { "User-Agent": UNC_UA, Accept: "text/plain" } });
  if (res.status >= 500) throw new Error(`UNC System: robots.txt unavailable (HTTP ${res.status}); not reading today`);
  const txt = res.ok ? await res.text() : null;
  for (const url of [UNC_LIST_URL, uncDetailUrl("0")]) {
    if (!robotsAllows(txt, url, "pmrfp-tenderfeed")) throw new Error(`UNC System: robots.txt disallows ${url}`);
  }
}

export async function fetchUncOpen(signal?: AbortSignal): Promise<UncBid[]> {
  await assertUncAllowed(signal);
  const bids = parseUncList(await get(UNC_LIST_URL, signal));
  if (!bids.length) throw new Error("UNC System: no listings parsed from the list page");
  return bids;
}

export async function fetchUncDetail(b: UncBid, signal?: AbortSignal): Promise<Map<string, string>> {
  return parseUncDetail(await get(uncDetailUrl(b.id), signal));
}

// ---------------------------------------------------------------- cron source

/** Gap between detail-page reads. */
const DETAIL_GAP_MS = 1000;

/**
 * The cron source. collect() reads the list (and the open eVP list, to drop
 * bids eVP already carries); enrich() reads the detail page of each NEW
 * listing only. If eVP can't be read the whole source is skipped for the day
 * (its rows are left alone) rather than risk a duplicate.
 */
export function uncSystemSource(opts: { evp?: (signal?: AbortSignal) => Promise<NcEvpBid[]>; gapMs?: number } = {}): Source {
  const bids = new Map<string, UncBid>();
  const evpOpen = opts.evp ?? fetchNcEvpOpen;
  const gap = opts.gapMs ?? DETAIL_GAP_MS;
  return {
    key: "unc-system",
    // ~17 open at a time; fewer than this means a bad read, not a quiet board.
    minMatchesToArchive: 4,
    fallbackRegion: "united-states",
    collect: async (today) => {
      const signal = AbortSignal.timeout(25_000);
      const [list, evp] = await Promise.all([fetchUncOpen(signal), evpOpen(signal)]);
      return list.flatMap((b): Candidate[] => {
        const categories = classifyUnc(b, today);
        if (!categories.length || ncEvpDuplicate(b, evp)) return [];
        const insert = uncToRfpInsert(b, null, today);
        if (!insert) return [];
        bids.set(insert.source_url, b);
        return [{ insert, categories, regionSlug: "us-north-carolina" }];
      });
    },
    enrich: async (fresh, { today }) => {
      const signal = AbortSignal.timeout(35_000);
      const out: Candidate[] = [];
      let stop = false;
      for (const c of fresh) {
        const b = bids.get(c.insert.source_url);
        let insert = c.insert;
        if (b && !stop && !signal.aborted) {
          try {
            if (out.length) await sleep(gap, signal);
            insert = uncToRfpInsert(b, await fetchUncDetail(b, signal), today) ?? c.insert;
          } catch {
            // Out of time or one page failed: this listing goes in from the list row alone.
            if (signal.aborted) stop = true;
          }
        }
        out.push({ ...c, insert });
      }
      return out;
    },
  };
}
