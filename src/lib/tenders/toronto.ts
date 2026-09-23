/**
 * City of Toronto → PMRFP public-tender feed.
 *
 * Toronto publishes every competitive solicitation as open data ("Toronto
 * Bids Solicitations", refreshed daily, Open Government Licence – Toronto:
 * commercial reuse allowed with attribution). PMRFP's core market is the
 * GTA, and a slice of this is exactly building-trade work: rooftop HVAC
 * replacement, fire-alarm upgrades, standby generators, flooring, roll-up
 * doors, building repairs at city facilities.
 *
 * The dataset has no title field — only a long description that usually
 * opens with procurement boilerplate — so titleFromDescription() strips the
 * boilerplate and keeps the actual work. Civil infrastructure (culverts,
 * bridges, sewer mains, roads) and pure supply orders (salt, chemicals,
 * parts) are dropped: not work a building trade bids on.
 */
import { parseCsv } from "./csv";
import { EXCLUDE, RULES, clean, slugify } from "./shared";
import type { TenderInsert } from "./canadabuys";

export const TORONTO_OPEN_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/f676f46c-de76-4e94-bba7-0a3951aa0603";
export const TORONTO_PORTAL_URL =
  "https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/toronto-bids-portal/";
import { OGL_TORONTO_ATTRIBUTION as TORONTO_ATTRIBUTION } from "./sources";
export { TORONTO_ATTRIBUTION };

export type TorontoRow = Record<string, string>;

const COL = {
  doc: "Document Number",
  type: "RFx (Solicitation) Type",
  issued: "Issue Date",
  deadline: "Submission Deadline",
  category: "High Level Category",
  description: "Solicitation Document Description",
  division: "Division",
  buyer: "Buyer Name",
  email: "Buyer Email",
  phone: "Buyer Phone Number",
} as const;

// Leading procurement boilerplate, most specific first.
const BOILERPLATE: RegExp[] = [
  /^this notice of intended procurement \(noip\) is to notify suppliers of the upcoming [^.]*? for (the )?/i,
  // "This RFQ/RFSQ/nRFP (the “RFQ”) is an invitation by the City of Toronto (the "City") to
  // prospective Suppliers/Proponents/Respondents to submit bids for / to qualify for …"
  /^(this|the) [^.]{0,80}? is an invitation by the city of toronto[^.]{0,40}? to prospective (suppliers|proponents|respondents)[^.]{0,40}? (to submit (bids|quotations|proposals) for|to qualify for( future eligibility to provide)?|for) (the )?/i,
  /^project works may include but are not limited to the following:.*?in brief summary, the work is comprised of but not limited to[;:]?\s*(\d\.\s*)?(the scope of this rft includes )?(the )?/i,
  /^the (work|project) generally consists of (the )?/i,
  /^the scope of this rf[a-z]+ includes (the )?/i,
  /^this project includes (the )?/i,
  /^request for (tenders|quotations|proposals|supplier qualifications) for (the )?/i,
];

/** The description with its procurement boilerplate removed. */
export function stripBoilerplate(description: string): string {
  let t = clean(description).replace(/\s+/g, " ");
  for (const re of BOILERPLATE) t = t.replace(re, "");
  return t;
}

export function titleFromDescription(description: string): string | null {
  let t = stripBoilerplate(description);
  // Cut at the first sentence end or trailing procurement phrasing.
  t = t.split(/(?<=[a-z0-9)])\.\s|\s+as further described|\s+to access the documents|\s+the term of the contract|\s+is posted to seek/i)[0] ?? "";
  t = t.replace(/[.;:,\s]+$/, "").trim();
  if (t.length < 12) return null;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t;
}

// Public-works infrastructure, not building trades.
const CIVIL = /culvert|bridge|watermain|sewer|road (re)?construction|resurfacing|transit|pedestrian bridge|creek|trenchless|pipe lining|red light camera/i;
// Pure supply orders: "supply and delivery of rock salt" — no service or
// installation anywhere in the opening. "Supply of ... maintenance services"
// and "supply and install" are trade work and stay in.
const SUPPLY_ONLY = /^(non-exclusive )?supply (and|&) delivery of|^(non-exclusive )?supply of /i;
const HAS_SERVICE = /services?|maintenance|install|repair|replacement|renovat/i;

/** PMRFP trade slugs for this Toronto solicitation (max 3), or [] to skip. */
export function classifyToronto(r: TorontoRow, today: string): string[] {
  const deadline = (r[COL.deadline] ?? "").slice(0, 10);
  if (!deadline || deadline < today) return [];
  const cat = r[COL.category] ?? "";
  if (cat !== "Construction Services" && cat !== "Goods and Services") return [];
  const title = titleFromDescription(r[COL.description] ?? "");
  if (!title) return [];
  // Judge on the opening of the real description, not the truncated title —
  // "…completion of the Work required on building repairs" is cut off there.
  const head = stripBoilerplate(r[COL.description] ?? "").slice(0, 400).toLowerCase();
  const t = title.toLowerCase();
  if (EXCLUDE.test(t) || CIVIL.test(t)) return [];
  if (SUPPLY_ONLY.test(t) && !HAS_SERVICE.test(head)) return [];
  return RULES.filter(([, p]) => p.test(head)).map(([slug]) => slug).slice(0, 3);
}

export function torontoToRfpInsert(r: TorontoRow, today: string): TenderInsert | null {
  const doc = (r[COL.doc] ?? "").trim();
  const title = titleFromDescription(r[COL.description] ?? "");
  if (!doc || !title) return null;
  const description = clean(r[COL.description] ?? "");
  const division = clean(r[COL.division] ?? "") || "City of Toronto";
  const type = clean(r[COL.type] ?? "");
  const issued = (r[COL.issued] ?? "").slice(0, 10);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  return {
    title,
    slug: `${slugify(title).slice(0, 70)}-tor-${slugify(doc)}`.replace(/-+/g, "-"),
    summary: description.length > 280 ? `${description.slice(0, 277).trimEnd()}…` : description,
    scope: description.slice(0, 8000),
    requirements: null,
    province: "Ontario",
    deadline: (r[COL.deadline] ?? "").slice(0, 10) || null,
    submission_instructions:
      `This is a public City of Toronto ${type || "solicitation"} issued by ${division} (document #${doc}). ` +
      "Bids are submitted directly to the City — search the document number on the City's bid portal for the " +
      "full solicitation, addenda and any site-meeting dates. PMRFP does not manage this bid.",
    contact_name: clean(r[COL.buyer] ?? "") || null,
    contact_email: clean(r[COL.email] ?? "") || null,
    contact_phone: clean(r[COL.phone] ?? "") || null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    // The dataset has no per-solicitation link; the portal is the official
    // place to find it, and ?doc= keeps each tender's source_url unique.
    source_url: `${TORONTO_PORTAL_URL}?doc=${encodeURIComponent(doc)}`,
    source_notes: `City of Toronto ${type} #${doc} · ${division}. ${TORONTO_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: !issued || issued >= yesterday ? `${today}T00:00:00Z` : `${issued}T00:00:00Z`,
  };
}

export async function fetchTorontoSolicitations(): Promise<TorontoRow[]> {
  const res = await fetch(TORONTO_OPEN_URL, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  if (!res.ok) throw new Error(`Toronto open data fetch failed: HTTP ${res.status}`);
  return parseCsv(await res.text());
}
