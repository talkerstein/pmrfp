/**
 * CanadaBuys → PMRFP public-tender feed.
 *
 * The Government of Canada publishes every open federal tender as open data
 * (CanadaBuys "Tender notices", Open Government Licence – Canada, which
 * permits commercial reuse with attribution). A slice of it is exactly the
 * work PMRFP trades do: furnace replacements on bases, snow removal at
 * research stations, janitorial, fire-protection maintenance, renos.
 *
 * This module is pure (no I/O besides fetchOpenTenders) so the classifier
 * can be unit-tested against real titles. The cron route owns the writes.
 */
import { parseCsv } from "./csv";
import { EXCLUDE, RULES, clean, slugify } from "./shared";

export const CANADABUYS_OPEN_URL =
  "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv";

/** Required by the Open Government Licence – Canada wherever the data is shown. */
export { OGL_CANADA_ATTRIBUTION as OGL_ATTRIBUTION } from "./sources";
import { OGL_CANADA_ATTRIBUTION as OGL_ATTRIBUTION } from "./sources";

export type TenderRow = Record<string, string>;

const COL = {
  title: "title-titre-eng",
  ref: "referenceNumber-numeroReference",
  published: "publicationDate-datePublication",
  closing: "tenderClosingDate-appelOffresDateCloture",
  category: "procurementCategory-categorieApprovisionnement",
  noticeType: "noticeType-avisType-eng",
  gsin: "gsinDescription-nibsDescription-eng",
  unspsc: "unspscDescription-eng",
  delivery: "regionsOfDelivery-regionsLivraison-eng",
  entity: "contractingEntityName-nomEntitContractante-eng",
  contactName: "contactInfoName-informationsContactNom",
  contactEmail: "contactInfoEmail-informationsContactCourriel",
  contactPhone: "contactInfoPhone-contactInfoTelephone",
  url: "noticeURL-URLavis-eng",
  description: "tenderDescription-descriptionAppelOffres-eng",
  selection: "selectionCriteria-criteresSelection-eng",
} as const;

const SKIP_NOTICE_TYPES = new Set([
  "Advance Contract Award Notice",
  "Directed Contract",
  "Not Applicable",
]);

/** PMRFP trade-category slugs this tender fits (max 3), or [] to skip it. */
export function classifyTender(r: TenderRow, today: string): string[] {
  // Services and construction only — goods purchases aren't trade work.
  if (!/SRV|CNST/.test(r[COL.category] ?? "")) return [];
  if (SKIP_NOTICE_TYPES.has(r[COL.noticeType] ?? "")) return [];
  const closing = (r[COL.closing] ?? "").slice(0, 10);
  if (closing && closing < today) return [];
  if (!deliversInCanada(r[COL.delivery] ?? "")) return [];

  const title = (r[COL.title] ?? "").toLowerCase();
  const codes = `${r[COL.gsin] ?? ""} ${r[COL.unspsc] ?? ""}`.toLowerCase();
  if (EXCLUDE.test(title)) return [];

  const head = `${title} ${codes}`;
  return RULES.filter(([, p]) => p.test(head)).map(([slug]) => slug).slice(0, 3);
}

const FOREIGN = /germany|world|united states|mexico|europe|asia|africa|\bindia\b|china|japan|united kingdom/i;
const CANADIAN = /canada|ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward|yukon|northwest|nunavut|national capital|ncr/i;

function deliversInCanada(delivery: string): boolean {
  // Blank delivery = unstated (CanadaBuys omits it for many domestic notices).
  if (!delivery.trim()) return true;
  if (CANADIAN.test(delivery)) return true;
  return !FOREIGN.test(delivery);
}

const PROVINCES: [pattern: RegExp, name: string][] = [
  [/national capital|\bncr\b/i, "Ontario"],
  [/ontario/i, "Ontario"],
  [/quebec|québec/i, "Quebec"],
  [/british columbia/i, "British Columbia"],
  [/alberta/i, "Alberta"],
  [/manitoba/i, "Manitoba"],
  [/saskatchewan/i, "Saskatchewan"],
  [/nova scotia/i, "Nova Scotia"],
  [/new brunswick/i, "New Brunswick"],
  [/newfoundland/i, "Newfoundland and Labrador"],
  [/prince edward/i, "Prince Edward Island"],
  [/yukon/i, "Yukon"],
  [/northwest territories/i, "Northwest Territories"],
  [/nunavut/i, "Nunavut"],
];

// Only regions PMRFP actually has. Anything else falls back to province-level
// (ontario/quebec) or national ("canada"), with the province kept as text.
const CITY_REGIONS: [pattern: RegExp, slug: string][] = [
  [/national capital|\bncr\b|ottawa/i, "ottawa"],
  [/toronto/i, "toronto"],
  [/edmonton/i, "edmonton"],
  [/calgary/i, "calgary"],
  [/vancouver/i, "vancouver"],
  [/winnipeg/i, "winnipeg"],
  [/montr[eé]al/i, "montreal"],
  [/hamilton/i, "hamilton"],
  [/mississauga/i, "mississauga"],
];

export function regionForTender(r: TenderRow): { regionSlug: string; province: string | null } {
  // "Ontario (except NCR)" means anywhere in Ontario BUT Ottawa — drop the
  // qualifier before matching or it reads as the NCR itself.
  const d = (r[COL.delivery] ?? "").replace(/\(except ncr\)/gi, "");
  const province = PROVINCES.find(([p]) => p.test(d))?.[1] ?? null;
  // Multi-region notices ("*Canada *Ontario *BC") are national in practice.
  const regionCount = d.split("*").filter((s) => s.trim()).length;
  if (regionCount <= 2) {
    const city = CITY_REGIONS.find(([p]) => p.test(d))?.[1];
    if (city) return { regionSlug: city, province };
  }
  if (regionCount <= 2 && province === "Ontario") return { regionSlug: "ontario", province };
  if (regionCount <= 2 && province === "Quebec") return { regionSlug: "quebec", province };
  return { regionSlug: "canada", province: regionCount <= 2 ? province : null };
}

export interface TenderInsert {
  title: string;
  slug: string;
  summary: string;
  scope: string;
  requirements: string | null;
  province: string | null;
  deadline: string | null;
  submission_instructions: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_visibility: "public_contact";
  source_type: "public_source";
  source_url: string;
  source_notes: string;
  status: "published";
  is_demo: false;
  /** The government's own publish date, not our import time — the alerts
   *  cron only emails RFPs published in the last ~26h, so the first import's
   *  backlog doesn't flood anyone; only genuinely new tenders alert. */
  published_at: string;
}

/** Maps one open tender to an rfp_posts row (minus region_id / timestamps). */
export function toRfpInsert(r: TenderRow, today: string): TenderInsert | null {
  const url = (r[COL.url] ?? "").trim();
  const title = clean(r[COL.title] ?? "");
  if (!url || !title) return null;

  const ref = (r[COL.ref] ?? "").trim();
  const description = clean(r[COL.description] ?? "");
  const closing = (r[COL.closing] ?? "").slice(0, 10) || null;
  // Standing supply arrangements / qualification lists close years out
  // (some list 2076). Showing that date reads as a data error; label it
  // honestly as ongoing instead.
  const horizon = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
  const ongoing = !!closing && closing > horizon;
  const entity = clean(r[COL.entity] ?? "Government of Canada");

  const firstPara = description.split(/\n\s*\n/)[0] ?? "";
  const summaryBase = firstPara.length > 20 ? firstPara : description;
  const summary =
    (ongoing ? "Ongoing qualification list — get on it once, bid on call-ups for years. " : "") +
    (summaryBase.length > 280 ? `${summaryBase.slice(0, 277).trimEnd()}…` : summaryBase || title);

  return {
    title: title.length > 180 ? `${title.slice(0, 177)}…` : title,
    slug: `${slugify(title).slice(0, 70)}-cb-${slugify(ref || url.split("/").pop() || "tender")}`.replace(/-+/g, "-"),
    summary,
    scope: description.slice(0, 8000) || title,
    requirements: clean(r[COL.selection] ?? "") || null,
    province: regionForTender(r).province,
    deadline: ongoing ? null : closing,
    submission_instructions:
      `This is a public federal tender issued by ${entity}. Bids are submitted directly to the ` +
      "Government of Canada through CanadaBuys — open the official notice for the full solicitation " +
      "documents, amendments and any bidders' conference dates. PMRFP does not manage this bid.",
    contact_name: clean(r[COL.contactName] ?? "") || null,
    contact_email: clean(r[COL.contactEmail] ?? "") || null,
    contact_phone: clean(r[COL.contactPhone] ?? "") || null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: url,
    source_notes: `CanadaBuys ${ref} · ${entity}. ${OGL_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    // Anything the government published since yesterday counts as new today
    // (the import runs once a day, so yesterday's late postings land now).
    // Older backlog keeps its real date and never triggers an alert.
    published_at: publishedAt(r[COL.published], today),
  };
}

function publishedAt(raw: string | undefined, today: string): string {
  const real = toIsoDate(raw);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (!real || real.slice(0, 10) >= yesterday) return `${today}T00:00:00Z`;
  return real;
}

function toIsoDate(s: string | undefined): string | null {
  const d = (s ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : null;
}

export async function fetchOpenTenders(): Promise<TenderRow[]> {
  // CanadaBuys' firewall 403s the default "node" User-Agent (verified
  // 2026-09-22); an honest identifying UA is accepted.
  const res = await fetch(CANADABUYS_OPEN_URL, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  if (!res.ok) throw new Error(`CanadaBuys fetch failed: HTTP ${res.status}`);
  return parseCsv(await res.text());
}
