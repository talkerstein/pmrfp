/**
 * Spam risk score for a new or edited company listing. Pure and unit-tested
 * (test/unit/org-risk.test.ts). Listings used to go live the moment a trade
 * and a region were chosen, which SEO agencies used to plant followed links
 * (fake "Fence Builder Boston" satellites). This adds a score with reasons:
 *
 *   score >= HOLD_SCORE     not auto-approved: profile_status 'pending_review',
 *                           reasons shown to the admin (Approve / Reject / Suspend)
 *   score >= REJECT_SCORE   or a blocked domain: the listing page is
 *                           rejected (not public) and the admin is told
 *   below HOLD_SCORE        unchanged: a real contractor with a business
 *                           email and a phone still goes live at once
 *
 * It never blocks the sign-up itself, only the listing's auto-approval.
 *
 * Rules (points):
 *   +3  email or website domain is on the blocked list (also an automatic reject)
 *   +3  the same company email domain (not gmail & co.) or the same website
 *       owner already runs another organization
 *   +2  keyword-stuffed satellite name (service + city/state + pros / guys /
 *       experts / best / near me)
 *   +2  gibberish name (a word with almost no vowels)
 *   +2  the company's country differs from the country the visitor signed up
 *       from, and the email is not on the company's own website domain
 *   +1  free email, no phone and no description
 *   -2  the email is on the company's own website domain and it has a phone
 * (A website-age check was left out: it would need a WHOIS lookup per signup.)
 */
import { emailDomain, isFreeEmailDomain } from "@/lib/dedupe/email";
import { websiteDomain, registrableDomain } from "@/lib/badge/install";

export const HOLD_SCORE = 3;
export const REJECT_SCORE = 6;

export interface OrgRiskInput {
  name: string;
  website?: string | null;
  /** The company's contact email (organizations.email). */
  email?: string | null;
  /** The sign-in email of the person who created it, when it differs. */
  accountEmail?: string | null;
  phone?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  city?: string | null;
  province?: string | null;
  /** organizations.country: "Canada" | "United States". */
  country?: string | null;
  /** signup_attribution.country: ISO code the visitor signed up from. */
  signupCountry?: string | null;
  /** Other organizations whose members share this company email domain (0 when free mail). */
  othersOnEmailDomain?: number;
  /** Other organizations with the same website domain. */
  othersOnWebsiteDomain?: number;
  /** Blocked registrable domains (table blocked_domains). */
  blockedDomains?: ReadonlySet<string> | readonly string[];
}

export interface RiskReason {
  code:
    | "blocked_domain"
    | "multiple_orgs"
    | "stuffed_name"
    | "gibberish_name"
    | "country_mismatch"
    | "thin_free_email"
    | "own_domain_phone";
  points: number;
  detail: string;
}

export interface OrgRisk {
  score: number;
  reasons: RiskReason[];
  /** Score >= HOLD_SCORE or a blocked domain: needs an admin before it is public. */
  hold: boolean;
  /** Score >= REJECT_SCORE or a blocked domain: the listing page is rejected. */
  reject: boolean;
  blocked: boolean;
}

/* ------------------------------------------------------------------ names */

const SERVICE_WORDS = new Set([
  "fence", "fencing", "builder", "builders", "cleaning", "cleaner", "cleaners", "maid", "maids", "epoxy", "installation", "installers",
  "installer", "roofing", "roofer", "roofers", "plumbing", "plumber", "plumbers", "electrician", "electricians", "painting", "painters",
  "painter", "landscaping", "landscapers", "paving", "concrete", "contractor", "contractors", "remodeling", "remodelers", "repair",
  "repairs", "hvac", "locksmith", "pest", "control", "junk", "removal", "demolition", "flooring", "tile", "masonry", "siding",
  "windows", "gutter", "gutters", "pressure", "washing", "carpet", "restoration", "waterproofing", "handyman", "movers", "moving",
  "towing", "garage", "door", "doors", "decks", "deck", "house", "home", "seo", "leads",
]);
const MODIFIERS = new Set(["pros", "pro's", "guys", "experts", "expert", "best", "top", "specialists", "gurus", "masters"]);
const MODIFIER_PHRASES = [/\bnear me\b/i, /#\s?1\b/, /\bno\.? ?1\b/i, /\b24\/7\b/];

const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
  "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas",
  "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
  "ontario", "quebec", "alberta", "british columbia", "manitoba", "saskatchewan", "nova scotia", "new brunswick", "newfoundland",
];
/** Big US/Canadian cities that show up in satellite names; the company's own city is checked too. */
const CITY_WORDS = [
  "boston", "louisville", "houston", "dallas", "austin", "phoenix", "denver", "atlanta", "miami", "orlando", "tampa", "chicago", "seattle",
  "portland", "nashville", "charlotte", "memphis", "detroit", "cleveland", "columbus", "cincinnati", "pittsburgh", "philadelphia",
  "baltimore", "brooklyn", "queens", "toronto", "mississauga", "brampton", "vancouver", "calgary", "edmonton", "ottawa", "montreal",
  "winnipeg", "hamilton", "london", "las vegas", "san diego", "san antonio", "san jose", "los angeles", "san francisco", "new orleans",
  "kansas city", "oklahoma city", "salt lake", "sacramento", "raleigh", "richmond", "indianapolis", "milwaukee", "minneapolis", "st louis",
];

const tokensOf = (name: string): string[] => name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9#'/]+/).filter(Boolean);

const hasPhrase = (haystack: string, phrase: string): boolean => new RegExp(`(^|[^a-z])${phrase.replace(/\s+/g, "\\s+")}([^a-z]|$)`).test(haystack);

/** "Louisville House Cleaning Pros": a service, a place and a "pros / guys / best" tag. */
export function keywordStuffedName(name: string, city?: string | null): boolean {
  const lower = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const tokens = tokensOf(name);
  if (tokens.length < 2) return false;
  const service = tokens.some((t) => SERVICE_WORDS.has(t));
  const ownCity = (city ?? "").trim().toLowerCase();
  const place =
    US_STATES.some((s) => hasPhrase(lower, s)) ||
    CITY_WORDS.some((c) => hasPhrase(lower, c)) ||
    (ownCity.length >= 3 && hasPhrase(lower, ownCity));
  const modifier = tokens.some((t) => MODIFIERS.has(t)) || MODIFIER_PHRASES.some((re) => re.test(lower));
  if (modifier && (service || place)) return true;
  // "Fence Builder Boston": two service words, or a service and a place, strung together with no brand.
  const serviceWords = tokens.filter((t) => SERVICE_WORDS.has(t)).length;
  return place && serviceWords >= 2;
}

const VOWELS = /[aeiouy]/;

/** A word with almost no vowels or a long run of consonants ("Jgvvjbd"). Short acronyms and digits are ignored. */
export function gibberishName(name: string): boolean {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5);
  for (const w of words) {
    const vowels = [...w].filter((c) => VOWELS.test(c)).length;
    const run = Math.max(...w.split(/[aeiouy]+/).map((x) => x.length));
    if (vowels / w.length < 0.2 || run >= 6) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ domains */

const listOf = (b: OrgRiskInput["blockedDomains"]): Set<string> => new Set([...(b ?? [])].map((d) => d.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean));

/** True when the host (or its registrable domain) is on the blocked list. */
export function isBlockedHost(host: string | null | undefined, blocked: ReadonlySet<string> | readonly string[] | undefined): boolean {
  const set = listOf(blocked);
  if (!set.size) return false;
  const h = (host ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!h) return false;
  const reg = registrableDomain(h);
  return set.has(h) || (reg != null && set.has(reg));
}

/** "Canada" | "United States" → "CA" | "US" (anything else null). */
function countryCode(country: string | null | undefined): "CA" | "US" | null {
  const c = (country ?? "").trim().toLowerCase();
  if (c === "canada" || c === "ca") return "CA";
  if (c === "united states" || c === "usa" || c === "us" || c === "united states of america") return "US";
  return null;
}

/** The score for one listing. */
export function scoreOrgRisk(input: OrgRiskInput): OrgRisk {
  const reasons: RiskReason[] = [];
  const add = (code: RiskReason["code"], points: number, detail: string) => reasons.push({ code, points, detail });

  const siteDomain = websiteDomain(input.website);
  const orgMail = emailDomain(input.email);
  const acctMail = emailDomain(input.accountEmail);
  const mailDomains = [...new Set([orgMail, acctMail].filter(Boolean))];
  const businessMail = mailDomains.filter((d) => !isFreeEmailDomain(d));

  // Blocked domain: email or website.
  const hit = [...mailDomains, siteDomain ?? ""].find((d) => d && isBlockedHost(d, input.blockedDomains));
  const blocked = Boolean(hit);
  if (hit) add("blocked_domain", 3, `${hit} is on the blocked list`);

  // More than one organization from the same owner.
  const sameMail = input.othersOnEmailDomain ?? 0;
  const sameSite = input.othersOnWebsiteDomain ?? 0;
  if (sameMail > 0 && businessMail.length) add("multiple_orgs", 3, `${sameMail + 1} organizations use the email domain ${businessMail[0]}`);
  else if (sameSite > 0 && siteDomain) add("multiple_orgs", 3, `${sameSite + 1} organizations use the website ${siteDomain}`);

  if (keywordStuffedName(input.name, input.city)) add("stuffed_name", 2, `"${input.name}" reads like a keyword-stuffed satellite name`);
  if (gibberishName(input.name)) add("gibberish_name", 2, `"${input.name}" looks like gibberish`);

  const ownMail = Boolean(siteDomain) && mailDomains.some((d) => registrableDomain(d) === siteDomain);
  const orgCc = countryCode(input.country);
  const signupCc = countryCode(input.signupCountry);
  if (orgCc && signupCc && orgCc !== signupCc && !ownMail) {
    add("country_mismatch", 2, `listed in ${orgCc} but signed up from ${signupCc}, and the email is not on the company's own website`);
  }

  const noPhone = !(input.phone ?? "").replace(/\D/g, "");
  const noDescription = (input.shortDescription ?? "").trim().length < 20 && (input.fullDescription ?? "").trim().length < 20;
  const freeOnly = mailDomains.length > 0 && businessMail.length === 0;
  if (freeOnly && noPhone && noDescription) add("thin_free_email", 1, "free email address, no phone and no description");

  if (ownMail && !noPhone) add("own_domain_phone", -2, "email is on the company's own website and it has a phone number");

  const score = Math.max(0, reasons.reduce((n, r) => n + r.points, 0));
  return {
    score,
    reasons,
    hold: blocked || score >= HOLD_SCORE,
    reject: blocked || score >= REJECT_SCORE,
    blocked,
  };
}

/** The status a new listing gets from its risk: rejected, held for review, or approved as before. */
export function statusFromRisk(risk: Pick<OrgRisk, "hold" | "reject">, normal: "approved" | "pending_review"): "approved" | "pending_review" | "rejected" {
  if (risk.reject) return "rejected";
  if (risk.hold) return "pending_review";
  return normal;
}
