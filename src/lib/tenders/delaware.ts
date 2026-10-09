/**
 * Delaware Open Bids (data.delaware.gov, Socrata dataset 2hnj-zwix) → PMRFP
 * public-tender feed.
 *
 * The State of Delaware publishes its currently open solicitations from the
 * MyMarketplace bid site (mmp.delaware.gov) as an open-data table. The
 * dataset only lists open bids, so a bid that closes leaves the feed and the
 * shared sync archives it. One request a day.
 *
 * The dataset has no contact or description columns: contact details stay on
 * the official notice, which every listing links to.
 *
 * Pure apart from fetchDelawareOpenBids(); the cron route owns the writes.
 */
import type { TenderInsert } from "./canadabuys";
import { CIVIL, EXCLUDE, RULES, clean, slugify } from "./shared";
import { TENDER_UA } from "./florida-vbs";
import { DELAWARE_ATTRIBUTION } from "./us-state-sources";

export const DELAWARE_API = "https://data.delaware.gov/resource/2hnj-zwix.json";

export interface DelawareBid {
  contractnumber?: string | null;
  contracttitle?: string | null;
  opendate?: string | null;
  deadlinedate?: string | null;
  agencycode?: string | null;
  unspsc?: string | null;
  bidurl?: { url?: string | null } | null;
}

// Forestry, highway right-of-way and supply calls the shared rules would
// misread as building trade work.
const DE_EXCLUDE = /timber|forest|harvest|right of way|purchase of|vehicles?\b|trucks?\b|equipment rental/i;

const AGENCIES: Record<string, string> = {
  OMB: "the Office of Management and Budget",
  DOT: "the Delaware Department of Transportation",
  NAT: "the Department of Natural Resources and Environmental Control",
  HSS: "the Department of Health and Social Services",
  ARNG: "the Delaware Army National Guard",
  DTCC: "Delaware Technical Community College",
  DSU: "Delaware State University",
  AGR: "the Department of Agriculture",
  DOE: "the Department of Education",
  STA: "the Department of State",
  GSS: "Government Support Services",
  CYF: "the Department of Services for Children, Youth and Their Families",
};

function date10(s: string | null | undefined): string {
  return (s ?? "").slice(0, 10);
}

function titleOf(bid: DelawareBid): string {
  return clean(bid.contracttitle || "").replace(/\s+/g, " ").trim();
}

/** Numeric bid id from the official notice URL (…/Bids/Details/9327). */
export function delawareId(bid: DelawareBid): number | null {
  const m = /\/Bids\/Details\/(\d+)/i.exec(bid.bidurl?.url ?? "");
  return m ? Number(m[1]) : null;
}

export function delawareAgency(code: string | null | undefined): string {
  const c = clean(code || "").toUpperCase();
  return AGENCIES[c] ?? (c ? `a State of Delaware agency (${c})` : "a State of Delaware agency");
}

/** PMRFP trade-category slugs (max 3), or [] to skip. */
export function classifyDelaware(bid: DelawareBid, today: string): string[] {
  const closing = date10(bid.deadlinedate);
  if (!closing || closing < today || !delawareId(bid)) return [];
  const title = titleOf(bid).toLowerCase();
  if (!title) return [];
  if (EXCLUDE.test(title) || CIVIL.test(title) || DE_EXCLUDE.test(title)) return [];
  return [...new Set(RULES.filter(([, p]) => p.test(title)).map(([slug]) => slug))].slice(0, 3);
}

export function delawareToRfpInsert(bid: DelawareBid, today: string): TenderInsert | null {
  const title = titleOf(bid);
  const id = delawareId(bid);
  if (!title || !id) return null;
  const agency = delawareAgency(bid.agencycode);
  const number = clean(bid.contractnumber || "") || `DE-${id}`;
  const published = date10(bid.opendate);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const shortTitle = title.length > 180 ? `${title.slice(0, 177)}…` : title;
  return {
    title: shortTitle,
    slug: `${slugify(title).slice(0, 60)}-debid-${id}`.replace(/-+/g, "-"),
    summary: `Delaware. Solicitation from ${agency}: ${shortTitle}.`,
    scope: `Solicitation ${number} — ${title}. Issued by ${agency}. Open the official notice for the bid documents, addenda, contact and any mandatory pre-bid meeting.`,
    requirements: null,
    province: "Delaware",
    deadline: date10(bid.deadlinedate) || null,
    submission_instructions:
      `This is a public State of Delaware solicitation (${number}, ${agency}), posted on the Delaware ` +
      "MyMarketplace bid site. Responses go to the issuing agency as the notice specifies. PMRFP does not manage this bid.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: `https://mmp.delaware.gov/Bids/Details/${id}`,
    source_notes: `Delaware ${number} · ${agency}. ${DELAWARE_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: !published || published >= yesterday ? `${today}T00:00:00Z` : `${published}T00:00:00Z`,
  };
}

export async function fetchDelawareOpenBids(signal?: AbortSignal): Promise<DelawareBid[]> {
  const res = await fetch(`${DELAWARE_API}?$limit=5000`, {
    cache: "no-store",
    signal,
    headers: { "User-Agent": TENDER_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Delaware Open Bids fetch failed: HTTP ${res.status}`);
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) throw new Error("Delaware Open Bids did not return a list");
  const out = new Map<number, DelawareBid>();
  for (const r of rows as DelawareBid[]) {
    const id = r ? delawareId(r) : null;
    if (id) out.set(id, r);
  }
  return [...out.values()];
}
