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
import { CIVIL, EXCLUDE, RULES, clean, slugify } from "./shared";
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

// Pure supply orders: "supply and delivery of rock salt" — no service or
// installation anywhere in the opening. "Supply of ... maintenance services"
// and "supply and install" are trade work and stay in.
const SUPPLY_ONLY = /^(non-exclusive )?supply (and|&) delivery of|^(non-exclusive )?supply of /i;
const HAS_SERVICE = /services?\b|maintenance|install|repair|replacement|renovat/i;

/* ── Open solicitations ──────────────────────────────────────────────────
 * Most rows open with procurement boilerplate ("This Request for Tender
 * (RFT) is an invitation by the City of Toronto to prospective Suppliers…"),
 * a location sentence, or both. Classifying only the first 400 characters
 * after a single-pass strip dropped most of the building work, so the
 * open-bid path works sentence by sentence: boilerplate sentences go,
 * lead-in phrases come off the first real one, and trades are read from the
 * whole description. Awards keep titleFromDescription/classifyTorontoAward. */

/** Lead-in phrases removed (repeatedly) from the front of the first real sentence. */
const LEAD_INS: RegExp[] = [
  /^\.?\d+[.)]?\s+/,
  /^this notice of intended procurement \(noip\) is to notify suppliers of the upcoming (negotiated )?(request for [a-z]+|n?rf[a-z]+)( \(n?[a-z]+\))? for (the )?/i,
  /^((this|the) )?.{0,80}? is an invitation by the city of toronto.{0,40}? to prospective [^.]{0,60}?(to submit (bids?|bid\(s\)|quotations|proposals) for|to qualify for( future eligibility to provide)?|for) (the )?/i,
  /^the city of toronto(['’]s)? .{0,80}? is bringing forward an? request for (tenders?|quotations?|proposals?) for (the )?/i,
  /^the city of toronto invites [^.]{0,60}? to submit (bids|quotations|proposals) for (the )?/i,
  /^this prequalified list will determine future eligibility to provide (the )?/i,
  /^this (request for [a-z ]+?|rf[a-z]+)( \([a-z]+\))? (includes|is for|is issued (to|for)) (the )?/i,
  /^request for (tenders?|quotations?|proposals?|supplier qualifications)( \([a-z]+\))? for (the )?/i,
  /^for:?\s+(the )?/i,
  /^(rfq|rft|rfp) for (the )?/i,
  /^the (work|project) generally (consists of|includes) (the )?/i,
  /^the scope of this rf[a-z]+ includes (the )?/i,
  /^this project includes (the )?/i,
  /^the successful (bidder|supplier|contractor) shall provide all labou?r, materials, equipment,? and services required to:?\s*/i,
  /^(the )?provision of /i,
  /^(the )?non-exclusive /i,
  /^[–•\-:;\s]+/,
];

/** Whole sentences that carry no scope: legal terms, portal pointers, site description. */
const NOISE_SENTENCE =
  /^(see part \d|please review|to access|it is the (city'?s )?intention|notwithstanding|in accordance with|bids from|the successful supplier will be required|suppliers should|the term of the contract|the solicitation (is|will)|the submission deadline|rf[a-z]+ closing|[a-z0-9' .-]{2,60} is located at|it is a (small |large )?(park|site|building|facility)|the existing [^.]{0,80} has reached the end of its service life)|invitation by the city of toronto [^.]*?(roster|prequalified) list/i;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[a-z0-9)\]])\.(?:\s+|$)|\s+\.\d+\s+|(?<=[;:])\s+\d+\.\s+(?=[A-Z])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function stripLeadIns(s: string): string {
  for (let pass = 0; pass < 4; pass++) {
    const before = s;
    for (const re of LEAD_INS) s = s.replace(re, "");
    if (s === before) break;
  }
  return s.trim();
}

/** The first sentence that says what the work is, lead-ins removed (untruncated). */
export function torontoLead(description: string): string {
  const text = clean(description).replace(/\s+/g, " ");
  for (const raw of sentences(text)) {
    if (NOISE_SENTENCE.test(raw)) continue;
    const s = stripLeadIns(raw)
      .split(/\s+as (?:further )?(?:described|explained)|\s+to access the documents|\s+please review all documentation|,?\s+for details,? please see/i)[0]
      .replace(/\s*[–-]\s*including but not limited to:?\s*/i, ": ")
      .replace(/[.;:,\s]+$/, "")
      .trim();
    if (s.length >= 12) return s;
  }
  return "";
}

/** "Clarinda Park is located at 31 Clarinda Dr…" → "Clarinda Park". */
function placeName(description: string): string | null {
  const m = /(?:^|\.\s+)([A-Z][\w'’.-]*(?: [A-Z][\w'’.-]*){0,5}) is located at\b/.exec(clean(description));
  return m ? m[1] : null;
}

/** A board-ready title (max ~90 chars) for an open Toronto solicitation, or null. */
export function torontoTitle(description: string): string | null {
  let t = torontoLead(description);
  if (t.length < 12) return null;
  // The work sentence often skips the site the location sentence named.
  const place = placeName(description);
  if (place && !t.toLowerCase().includes(place.toLowerCase())) {
    t = `${place}: ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  }
  // "SITE WORK: concrete paving…": a shouted lead phrase, sentence-cased.
  t = t.replace(/^[A-Z][A-Z &/-]{3,}(?=[:\s])/, (m) => m.charAt(0) + m.slice(1).toLowerCase());
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= 90) return t;
  const cut = t.slice(0, 89);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 60)).replace(/[\s,;:(–-]+$/, "")}…`;
}

// Hard civil: a building trade doesn't bid these, even in Construction Services.
const HARD_CIVIL =
  /culvert|bridge|watermain|water main|sewer|creek|trenchless|pipe lining|ttc track|track replacement|transit|overpass|dredg|treatment plant|pumping station/i;
// Road and parking paving: paving trades are members, so this stays in
// (under Concrete & Asphalt) even though the shared CIVIL list drops it.
const ROAD_PAVING = /resurfacing|road paving|asphalt paving|parking lot|pavement (rehabilitation|repairs?)|guide rail/i;
// Toronto-only exclusions on top of the shared EXCLUDE: professional
// services, software, fleet and vehicles, plain goods.
const TORONTO_EXCLUDE =
  /professional (and technical |engineering )?(landscape )?(design )?services|appraisal|sponsorship|audit|assurance services|scheduler|technical advisor|licen[cs]es?\b|server hardware|tractors?\b|trailers?\b|vehicles?\b|\bfleet\b|\boem\b|bunker suits?|eyewear|interpretation services|litter bins?|food service equipment|chemicals?\b|lubricat|\bhay\b|forms and products|tents?\b/i;

// Words that name a place, not the work ("Dufferin Waste Management Facility
// Office Building", "rooftop HVAC systems"); neutralized before trade matching.
const PLACE_NAMES: [RegExp, string][] = [
  [/waste management (facility|yard|division|services)/gi, "site"],
  [/roof-?top (hvac|units?|mechanical|equipment|air)/gi, "packaged $1"],
  [/\brtus?\b/gi, "hvac units"],
  // Part of a renovation scope, not a demolition job.
  [/selective demolition/gi, "selective removals"],
];

// Toronto park and site work the shared RULES phrase differently.
const TORONTO_RULES: [slug: string, pattern: RegExp][] = [
  ["landscaping", /landscape (general )?contractor|construction of (two |three |\w+ )?parks?|park (construction|improvements?|revitali[sz]ation)|playground|play equipment|splash pad|tree planting|shrub planting|\bsod(ding)?\b|mulch/i],
  ["concrete-and-asphalt", ROAD_PAVING],
];

// Clearly building / property / site construction: general contracting when
// no specific trade is named, and first when the job spans many trades.
const GC_SIGNAL =
  /general construction|capital construction|state of good repair|\bsogr\b|construction management services|construction services for|general contractor|office building|staircase|stairway|site works?\b|building works|renovations?\b|accessibility (improvements|upgrades)|aoda/i;
const MULTI_TRADE = /general construction|capital construction|state of good repair|\bsogr\b|construction management services/i;

/** Trade slugs found in text, ordered by where they first appear. */
function tradesByPosition(text: string): string[] {
  const hits: [number, string][] = [];
  for (const [slug, re] of [...RULES, ...TORONTO_RULES]) {
    const m = re.exec(text);
    if (m) hits.push([m.index, slug]);
  }
  return [...new Set(hits.sort((a, b) => a[0] - b[0]).map(([, slug]) => slug))];
}

function neutralize(text: string): string {
  let t = text;
  for (const [re, to] of PLACE_NAMES) t = t.replace(re, to);
  return t;
}

/** PMRFP trade slugs for this Toronto solicitation (max 3), or [] to skip. */
export function classifyToronto(r: TorontoRow, today: string): string[] {
  const deadline = (r[COL.deadline] ?? "").slice(0, 10);
  if (!deadline || deadline < today) return [];
  const cat = r[COL.category] ?? "";
  const construction = cat === "Construction Services";
  if (!construction && cat !== "Goods and Services") return [];
  const description = r[COL.description] ?? "";
  if (!torontoTitle(description)) return [];
  const lead = torontoLead(description).toLowerCase();

  // Exclusions judge the first real sentence (untruncated), never the long
  // body: "testing, commissioning, training" sits in every building scope.
  if (EXCLUDE.test(lead) || TORONTO_EXCLUDE.test(lead) || HARD_CIVIL.test(lead)) return [];
  if (CIVIL.test(lead) && !ROAD_PAVING.test(lead)) return [];
  if (SUPPLY_ONLY.test(lead) && !HAS_SERVICE.test(lead)) return [];

  const leadTrades = tradesByPosition(neutralize(lead));
  // Goods and Services: only when the work itself names a trade.
  if (!construction) return leadTrades.slice(0, 3);

  const body = tradesByPosition(neutralize(clean(description).replace(/\s+/g, " ").toLowerCase()));
  const multi = MULTI_TRADE.test(lead);
  const gc = multi || GC_SIGNAL.test(lead) || !leadTrades.length ? ["general-contracting"] : [];
  const ordered = multi ? [...gc, ...body] : [...leadTrades, ...gc, ...body];
  // High Level Category = Construction Services is a strong signal: clearly
  // building/site work that names no specific trade is general contracting.
  return [...new Set(ordered)].slice(0, 3);
}

export function torontoToRfpInsert(r: TorontoRow, today: string): TenderInsert | null {
  const doc = (r[COL.doc] ?? "").trim();
  const title = torontoTitle(r[COL.description] ?? "");
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
    // Named buyer contacts are personal information, which OGL – Toronto
    // excludes. Bidders get the buyer from the City's portal instead.
    contact_name: null,
    contact_email: null,
    contact_phone: null,
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

/* ── Past contracts: "Toronto Bids Awarded Contracts" ────────────────────
 * Same portal licence (OGL – Toronto). Winner always present; the dollar
 * value only on a minority of rows, so most read "value not disclosed".
 * Buyer name/email/phone are personal information under the licence's
 * exemptions and are never imported. */
export const TORONTO_AWARDS_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/e211f003-5909-4bea-bd96-d75899d8e612";
export const TORONTO_AWARD_WINDOW_DAYS = 365;

const AWD = {
  doc: "Document Number",
  type: "RFx (Solicitation) Type",
  category: "High Level Category",
  supplier: "Successful Supplier",
  award: "Award",
  date: "Award Authority Obtained Date",
  division: "Division",
  description: "Solicitation Document Description",
} as const;

export function classifyTorontoAward(r: TorontoRow, today: string): string[] {
  const date = (r[AWD.date] ?? "").slice(0, 10);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - TORONTO_AWARD_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (!date || date > today || date < cutoff) return [];
  if (!(r[AWD.supplier] ?? "").trim()) return [];
  const cat = r[AWD.category] ?? "";
  if (cat !== "Construction Services" && cat !== "Goods and Services") return [];
  const title = titleFromDescription(r[AWD.description] ?? "");
  if (!title) return [];
  const head = stripBoilerplate(r[AWD.description] ?? "").slice(0, 400).toLowerCase();
  const t = title.toLowerCase();
  // Award descriptions are often procurement boilerplate the stripper can't
  // turn into a title. Better to skip than publish "No award has been made".
  if (BOILERPLATE_TITLE.test(t)) return [];
  if (EXCLUDE.test(t) || CIVIL.test(t)) return [];
  if (SUPPLY_ONLY.test(t) && !HAS_SERVICE.test(head)) return [];
  return RULES.filter(([, p]) => p.test(head)).map(([slug]) => slug).slice(0, 3);
}

const BOILERPLATE_TITLE =
  /^(\.?\d|this |the scope|only the bids|no award|(the )?work under this contract|it is the contractor|the city|request for|the purpose|as per|further to|pursuant|in accordance)/i;

export function torontoAwardToRfpInsert(r: TorontoRow, _today?: string): TenderInsert | null {
  const doc = (r[AWD.doc] ?? "").trim();
  const title = titleFromDescription(r[AWD.description] ?? "");
  const supplier = clean(r[AWD.supplier] ?? "");
  const date = (r[AWD.date] ?? "").slice(0, 10);
  if (!doc || !title || !supplier || !date) return null;
  const amount = Number(String(r[AWD.award] ?? "").replace(/[^\d.]/g, "")) || 0;
  const value = amount >= 1000 ? `$${Math.round(amount).toLocaleString("en-CA")} CAD` : null;
  const division = clean(r[AWD.division] ?? "") || "City of Toronto";
  const when = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const headline = `Awarded ${when} to ${supplier}${value ? ` — ${value}` : " — value not disclosed"}.`;
  return {
    title,
    slug: `${slugify(title).slice(0, 60)}-tora-${slugify(doc)}`.replace(/-+/g, "-"),
    summary: `${headline} Past public contract from the City of Toronto (${division}).`,
    scope: [headline, clean(r[AWD.description] ?? "").slice(0, 6000)].join("\n\n"),
    requirements: null,
    province: "Ontario",
    deadline: date,
    submission_instructions:
      "This contract has already been awarded — it's listed so trades can see who wins this kind of work. " +
      "It did not go through PMRFP.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: `${TORONTO_PORTAL_URL}?doc=${encodeURIComponent(doc)}#award`,
    source_notes: `City of Toronto award · ${r[AWD.type] ?? ""} #${doc} · ${division}. ${TORONTO_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: `${date}T00:00:00Z`,
  };
}

export async function fetchTorontoAwards(): Promise<TorontoRow[]> {
  const res = await fetch(TORONTO_AWARDS_URL, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  if (!res.ok) throw new Error(`Toronto awards fetch failed: HTTP ${res.status}`);
  return parseCsv(await res.text());
}
