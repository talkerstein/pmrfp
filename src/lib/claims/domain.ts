/**
 * Claim verification for contract-winner pages (pure, unit-tested).
 *
 * A claim goes live at once only when BOTH hold:
 *  1. the claimant's email is at the company website's domain
 *     (bob@mail.acmepaving.ca and https://www.acmepaving.ca), and the domain
 *     is not a free mailbox (gmail.com can't prove anything);
 *  2. that domain looks like the winner's name ("Acme Paving Ltd." ↔
 *     acmepaving.ca), so nobody can claim someone else's page with their own
 *     company's domain.
 * Anything else goes to the admin review queue.
 */

/** Two-label public suffixes we see in Canada/U.S. business domains. */
const MULTI_SUFFIX = new Set([
  "on.ca", "qc.ca", "bc.ca", "ab.ca", "mb.ca", "sk.ca", "ns.ca", "nb.ca", "nl.ca", "pe.ca", "yk.ca", "nt.ca", "nu.ca",
  "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.nz", "com.mx", "co.us",
]);

/** Free / personal mailbox domains: never proof of who owns a company. */
export const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.ca", "live.com", "live.ca", "msn.com",
  "yahoo.com", "yahoo.ca", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "mail.com", "zoho.com", "videotron.ca", "sympatico.ca", "bell.net", "rogers.com", "shaw.ca", "telus.net",
  "cogeco.ca", "eastlink.ca", "comcast.net", "att.net", "verizon.net", "sbcglobal.net", "fastmail.com", "hey.com",
]);

/** "https://www.Acme-Paving.ca/about" → "acme-paving.ca" (null when it isn't a hostname). */
export function hostOf(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}

/** "mail.acmepaving.ca" → "acmepaving.ca"; "shop.acme.on.ca" → "acme.on.ca". */
export function registrableDomain(host: string | null | undefined): string | null {
  const h = hostOf(host);
  if (!h) return null;
  const parts = h.split(".");
  if (parts.length < 2) return null;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_SUFFIX.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join(".");
  return lastTwo;
}

export function emailDomain(email: string | null | undefined): string | null {
  const m = (email ?? "").trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  return m ? registrableDomain(m[1]) : null;
}

/** Email and website share a registrable domain, and it isn't a free mailbox. */
export function emailMatchesWebsite(email: string | null | undefined, website: string | null | undefined): boolean {
  const e = emailDomain(email);
  const w = registrableDomain(website);
  return Boolean(e && w && e === w && !FREE_MAIL.has(e));
}

/** Words that say nothing about WHICH company it is. */
const GENERIC = new Set([
  "the", "and", "of", "de", "des", "du", "la", "le", "les", "et",
  "inc", "ltd", "ltee", "limited", "corp", "corporation", "co", "company", "llc", "lp", "ulc", "incorporated", "group", "groupe",
  "construction", "constructions", "contracting", "contractors", "contractor", "services", "service", "enterprises", "entreprises",
  "solutions", "systems", "industries", "canada", "canadian", "international", "general", "building", "builders",
  // Trade words: "roofing" in a domain says nothing about which roofer.
  "roofing", "roof", "paving", "asphalt", "concrete", "electric", "electrical", "mechanical", "plumbing", "heating", "hvac",
  "cleaning", "cleaners", "janitorial", "maintenance", "environmental", "restoration", "landscaping", "landscape", "excavation",
  "excavating", "painting", "painters", "glass", "glazing", "doors", "windows", "security", "fire", "waste", "management",
  "supply", "supplies", "project", "projects", "development", "developments", "infrastructure", "engineering", "energy", "power",
  "drainage", "masonry", "steel", "welding", "demolition", "abatement", "lawn", "snow", "flooring", "floors", "fencing",
  "elevator", "elevators", "technologies", "technology", "interiors", "renovations", "civil", "utilities", "marine", "north",
  "south", "east", "west", "ontario", "quebec", "toronto", "pro", "pros", "best",
]);

const plain = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ");

/** Distinctive words of a company name ("Acme Paving Ltd." → ["acme", "paving"]). */
export function nameTokens(name: string): string[] {
  return plain(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
}

/**
 * Does the domain's own label look like the winner's name? True when the label
 * contains a distinctive word of the name (4+ letters), or the name's initials
 * (3+ of them, "Dexter Construction Co Ltd" → no; "R J Smith Paving" → "rjsp").
 */
export function domainMatchesName(domain: string | null | undefined, name: string): boolean {
  const d = registrableDomain(domain);
  if (!d) return false;
  const label = d.split(".")[0].replace(/-/g, "");
  if (label.length < 3) return false;
  const tokens = nameTokens(name);
  if (tokens.some((w) => w.length >= 4 && label.includes(w))) return true;
  // Short brands: the whole label is a token ("abc.ca" for "ABC Paving").
  if (tokens.some((w) => w === label)) return true;
  const initials = plain(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !["inc", "ltd", "ltee", "limited", "corp", "co", "llc", "the", "and", "of"].includes(w))
    .map((w) => w[0])
    .join("");
  return initials.length >= 3 && label.startsWith(initials);
}

export type ClaimMethod = "email_domain" | "admin_review";

/** The one decision: auto-approve (email_domain) or send to admins. */
export function claimMethod(input: { email: string; website: string | null; winnerName: string }): ClaimMethod {
  return emailMatchesWebsite(input.email, input.website) && domainMatchesName(input.website, input.winnerName) ? "email_domain" : "admin_review";
}

/** Org types that can claim a contract-winner page. */
export const CLAIM_ORG_TYPES = ["trade_company", "supplier", "builder"] as const;
export function canClaim(orgType: string | null | undefined): boolean {
  return (CLAIM_ORG_TYPES as readonly string[]).includes(orgType ?? "");
}
