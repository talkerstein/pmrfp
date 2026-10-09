/**
 * South Carolina Business Opportunities (SCBO) → PMRFP public-tender feed.
 *
 * SCBO (scbo.sc.gov) is the State's official daily publication of bid
 * advertisements — state agencies, universities, technical colleges, school
 * districts, counties, towns and housing authorities all advertise there.
 * The online edition is public (no login). robots.txt allows
 * /online-edition (it only disallows /search, /admin, /user…) and asks for a
 * 10-second crawl delay, which we honour: four category pages a day, 10 s
 * apart. The Division of Procurement Services disclaimer is a warranty
 * notice only — no reuse restriction.
 *
 * Kept: Construction, Maintenance/Repair, Minor Construction and Services
 * ads whose title names building or facility work, with a future bid date.
 * Each listing links to the ad's printable SCBO page.
 *
 * Pure apart from fetchScboAds(); the cron route owns the writes.
 */
import type { TenderInsert } from "./canadabuys";
import { CIVIL, EXCLUDE, cap, clean, publishedAt, slugify, tradesFor } from "./shared";
import { TENDER_UA } from "./florida-vbs";
import { SCBO_ATTRIBUTION } from "./us-state-sources";

export const SCBO_BASE = "https://scbo.sc.gov";
export const SCBO_AD_URL = `${SCBO_BASE}/printad?a=`;

/** SCBO category codes → the kind of work. Services ads must name a trade. */
export const SCBO_CATEGORIES = { 3: "Construction", 8: "Maintenance/Repair", 9: "Minor Construction", 11: "Services" } as const;
export type ScboCategory = keyof typeof SCBO_CATEGORIES;
const CRAWL_DELAY_MS = 10_000;

export interface ScboAd {
  id: string;
  category: ScboCategory;
  title: string;
  agency: string;
  number: string;
  /** YYYY-MM-DD bid/quote due date. */
  closing: string | null;
  posted: string | null;
  location: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "October 14, 2026 - 2:00pm" → "2026-10-14". */
export function scboDate(s: string): string | null {
  const m = s.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

function decode(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The value cell after a `<b>Label:</b>` cell, as plain text. */
function field(block: string, ...labels: string[]): string {
  for (const label of labels) {
    const m = block.match(
      new RegExp(`<b>${escapeRe(label)}:?\\s*</b>\\s*(?:</div>\\s*)+<div class="adata_itm[^"]*"[^>]*>(?:\\s*<div[^>]*>)?([\\s\\S]*?)</div>`),
    );
    if (m) {
      const v = clean(decode(m[1]));
      if (v && v.toLowerCase() !== "n/a") return v;
    }
  }
  return "";
}

/** Every ad on one online-edition category page. */
export function parseScboPage(html: string, category: ScboCategory): ScboAd[] {
  const blocks = html.split(/(?=<div class="adata_itm[^"]*"><b>(?:Project Name|Ad Title):)/).slice(1);
  const out: ScboAd[] = [];
  for (const b of blocks) {
    const id = b.match(/printad\?a=(\d+)/)?.[1];
    const title = field(b, "Project Name", "Ad Title").replace(/\s+/g, " ");
    if (!id || !title) continue;
    out.push({
      id,
      category,
      title,
      agency: field(b, "Agency/Owner", "Purchasing Agent/Entity"),
      number: field(b, "Project Number", "Solicitation #"),
      closing: scboDate(field(b, "Bid/Submittal Date & Time", "Quote Due Date & Time", "Bid/Submittal Due Date")),
      posted: scboDate(field(b, "Ad Publish Date")),
      location: field(b, "Project Location"),
      description: field(b, "Description"),
      contactName: field(b, "Agency Project Coordinator", "Direct Inquiries To"),
      contactEmail: field(b, "Email", "Buyer Email").match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0] ?? "",
      contactPhone: field(b, "Telephone", "Buyer Phone#"),
    });
  }
  return out;
}

/** The edition date the site is serving now, from its category links ("c=3-2026-10-08"). */
export function scboEditionDate(indexHtml: string): string | null {
  return indexHtml.match(/online-edition\?c=\d+-(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

// Utility, road and site-civil work SCBO's Construction category is full of.
const SC_CIVIL =
  /water ?line|water main|force main|\bwwtp\b|\bwrrf\b|wastewater|water reclamation|water treatment|\bwtp\b|pump station|drainage|stormwater|storm drain|streetscape|streets? (?:improvement|rehab|resurfac|repair|paving)|\broads? (?:improvement|resurfac|rehab|repair|paving|widening|construction|project)|\broads \d{4}|(?:to|of) [\w ]{0,30}roads\b|asphalt for|sidewalk|intersection|pavement marking|surface treatment|\bwells?\b|meter replacement|geomembrane|\bponds?\b|\bdam\b|widening|trail|pathway|notice to contractors|depth patch|\bpatching\b|manhole|wetwell|dredg|boat slip|\bdebris\b|forest|landfill|towing|\brrfb\b/;
const SC_SKIP =
  /third[- ]party inspect|commissioning|program management|hydraulic model|\bappraisal|food service|dining|vending|concession|restaurant|uniforms?\b|rental|supplies|aircraft|exhibit|memorabilia|class ring|charter bus|transportation|software|platform|captioning|psych|underwriting|auditing|survey|chemicals|energy (savings|performance)|fountain|pickleball|tennis|track renovation|ball ?field|athletic field|turf|scoreboard|safety netting|solar|temporary fence/;

/** PMRFP trade slugs (max 3), or [] to skip. */
export function classifyScbo(ad: ScboAd, today: string): string[] {
  if (!ad.closing || ad.closing < today) return [];
  const title = ad.title.toLowerCase();
  if (title.length < 6 || EXCLUDE.test(title) || CIVIL.test(title) || SC_CIVIL.test(title) || SC_SKIP.test(title)) return [];
  return tradesFor(title);
}

export function scboToRfpInsert(ad: ScboAd, today: string): TenderInsert | null {
  if (!ad.title || !ad.closing) return null;
  const title = cap(ad.title, 180);
  const agency = ad.agency || "a South Carolina public body";
  const about = ad.description.length > 20 ? ad.description : title;
  return {
    title,
    slug: `${slugify(ad.title).slice(0, 60)}-scbo-${ad.id}`.replace(/-+/g, "-"),
    summary: `South Carolina. ${agency}: ${cap(about.replace(/\s+/g, " "), 240)}`,
    scope: [
      `${SCBO_CATEGORIES[ad.category]} — ${ad.title}${ad.number ? ` (${ad.number})` : ""}.`,
      ad.location ? `Location: ${ad.location}.` : "",
      about !== title ? about : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000),
    requirements: null,
    province: "South Carolina",
    deadline: ad.closing,
    submission_instructions:
      `This is a public South Carolina solicitation${ad.number ? ` (${ad.number})` : ""} issued by ${agency}, advertised in ` +
      "South Carolina Business Opportunities (SCBO). Open the official ad for where to get documents and how to submit; " +
      "bids go to the issuing agency, not PMRFP. PMRFP does not manage this bid.",
    contact_name: ad.contactName || null,
    contact_email: ad.contactEmail || null,
    contact_phone: ad.contactPhone || null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: `${SCBO_AD_URL}${ad.id}`,
    source_notes: `SCBO ad ${ad.id}${ad.number ? ` · ${ad.number}` : ""} · ${agency}. ${SCBO_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(ad.posted, today),
  };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    });
  });

async function get(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { cache: "no-store", signal, headers: { "User-Agent": TENDER_UA } });
  if (!res.ok) throw new Error(`SCBO fetch failed: HTTP ${res.status} (${url})`);
  return res.text();
}

/**
 * One polite pass: the edition index, then each category page, 10 s apart
 * (robots.txt Crawl-delay). ~40 s in all, so SCBO gets its own cron route.
 */
export async function fetchScboAds(signal?: AbortSignal): Promise<ScboAd[]> {
  const edition = scboEditionDate(await get(`${SCBO_BASE}/online-edition`, signal));
  if (!edition) throw new Error("SCBO: edition date not found on the online edition page");
  const out = new Map<string, ScboAd>();
  for (const c of Object.keys(SCBO_CATEGORIES).map(Number) as ScboCategory[]) {
    await sleep(CRAWL_DELAY_MS, signal);
    for (const ad of parseScboPage(await get(`${SCBO_BASE}/online-edition?c=${c}-${edition}`, signal), c)) {
      if (!out.has(ad.id)) out.set(ad.id, ad);
    }
  }
  return [...out.values()];
}
