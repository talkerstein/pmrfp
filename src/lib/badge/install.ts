/**
 * Is a company's PMRFP badge loading on its OWN website? Pure and unit-tested
 * (test/unit/badge-install.test.ts).
 *
 * The evidence is the badge_hits counters (lib/badge/hits): one row per day ×
 * badge × slug × embedding domain, where the domain is the Referer header cut
 * down to a bare hostname (lib/badge/referrer). A company counts as
 * "installed on its site" when its badge was requested from a page on the
 * company's own website domain (the registrable domain of
 * organizations.website) on at least INSTALL_MIN_DAYS different days.
 *
 *  - A request with no Referer (referrer "") proves nothing, and a request
 *    from some other site (a directory, an agency preview, a competitor
 *    copying the code) is not the company's own site. Both are ignored.
 *  - PMRFP's own pages, localhost and *.vercel.app never reach this table
 *    (referrerDomain returns null for them), so a preview or the badge page
 *    can't count as an install.
 *  - Two different days, because one visit can be a person testing the code
 *    in a preview; a badge that keeps loading on later days is on a real page.
 *  - "Same site" means the same registrable domain: acme.ca matches
 *    www.acme.ca, shop.acme.ca and blog.acme.ca. Free site-builder
 *    subdomains (acme.wixsite.com) are treated as their own sites, so one
 *    Wix customer can't match another.
 */
import type { BadgeKind } from "./snippet";

export const INSTALL_MIN_DAYS = 2;
/** The badges that point at the company's own directory profile (the winner badge is keyed by a contract-winner slug instead). */
export const INSTALL_KINDS: readonly BadgeKind[] = ["listed", "karma"];

/**
 * Public suffixes of more than one label, for the countries our members are
 * in, plus site-builder / hosting domains where every customer gets a
 * subdomain. A registrable domain is one label plus one of these (or one
 * label plus a single-label TLD).
 */
const MULTI_LABEL_SUFFIXES = new Set([
  // Canada: provincial second-level domains and government
  "ab.ca", "bc.ca", "mb.ca", "nb.ca", "nf.ca", "nl.ca", "ns.ca", "nt.ca", "nu.ca", "on.ca", "pe.ca", "qc.ca", "sk.ca", "yk.ca", "gc.ca",
  // United States: the old locality namespace and a few shared ones
  "k12.ny.us", "lib.ny.us", "cc.ny.us",
  // Other English-speaking and common markets
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "org.nz", "net.nz",
  "co.za", "co.in", "com.sg", "com.hk", "co.jp", "com.mx", "com.br", "com.ar", "com.co", "com.pe", "com.ve", "com.ec", "com.uy",
  // Site builders and hosts: a customer is a subdomain, so the "site" is the subdomain
  "wixsite.com", "myshopify.com", "square.site", "weebly.com", "godaddysites.com", "webflow.io", "carrd.co",
  "squarespace.com", "wordpress.com", "blogspot.com", "tumblr.com", "github.io", "gitlab.io", "netlify.app", "pages.dev",
  "herokuapp.com", "business.site", "sites.google.com", "notion.site", "framer.app", "framer.website", "lovable.app",
  "myportfolio.com", "site123.me", "strikingly.com", "jimdosite.com", "ueniweb.com", "mystrikingly.com", "webnode.com",
]);

/** Our own domains and test hosts: never a company's "own site" for a reward (lib/badge/reward). */
const OWN_DOMAINS = ["pmrfp.com", "pmrfp.ca", "talkerstein.com", "talkerstein.ca"];
const TEST_DOMAINS = ["example.com", "example.org", "example.net", "test.com", "vercel.app", "localhost"];
const TEST_TLDS = [".test", ".example", ".invalid", ".localhost", ".local"];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** "Shop.Acme.CA" → "acme.ca"; "a.b.co.uk" → "b.co.uk"; "acme.wixsite.com" → "acme.wixsite.com"; junk → null. */
export function registrableDomain(host: string | null | undefined): string | null {
  const h = (host ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!h || !/^[a-z0-9.-]{1,253}$/.test(h)) return null;
  if (IPV4.test(h)) return h;
  const labels = h.split(".");
  if (labels.length < 2 || labels.some((l) => !l || l.startsWith("-") || l.endsWith("-"))) return null;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  const lastThree = labels.slice(-3).join(".");
  if (labels.length >= 4 && MULTI_LABEL_SUFFIXES.has(lastThree)) return labels.slice(-4).join(".");
  return lastTwo;
}

/** The registrable domain of what a member typed as their website ("https://www.acme.ca/about", "acme.ca", "WWW.Acme.ca/"). Null when there is none. */
export function websiteDomain(website: string | null | undefined): string | null {
  const raw = (website ?? "").trim();
  // An address (mailto:, user@host) or anything with a space is not a website.
  if (!raw || /[\s@]/.test(raw)) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  return registrableDomain(host.replace(/^www\./i, ""));
}

/** One of ours, or a test / preview host: an install there is not a reward. */
export function isOwnOrTestDomain(domain: string | null | undefined): boolean {
  const d = (domain ?? "").trim().toLowerCase();
  if (!d) return false;
  const on = (list: readonly string[]) => list.some((x) => d === x || d.endsWith(`.${x}`));
  return on(OWN_DOMAINS) || on(TEST_DOMAINS) || TEST_TLDS.some((t) => d.endsWith(t));
}

/** A badge_hits row, as far as detection needs it. `day` is YYYY-MM-DD (Toronto day). */
export interface BadgeHitRow {
  day: string;
  kind: string;
  slug: string;
  referrer: string;
}

export interface BadgeInstall {
  /** The company's own site (registrable domain), or null when its profile has no usable website. */
  domain: string | null;
  /** Badge loaded from the company's own site on at least INSTALL_MIN_DAYS different days. */
  detected: boolean;
  /** Distinct days with a load from the company's own site. */
  days: number;
  firstDay: string | null;
  /** The day the install became "detected": its INSTALL_MIN_DAYS-th distinct day. */
  detectedOn: string | null;
  lastDay: string | null;
  /** Other embedding sites seen (not the company's own): for the admin, never counted. */
  otherSites: string[];
  /** The company's website is one of ours or a test host. */
  ownDomain: boolean;
}

/** Detection for one company from its badge_hits rows (any slug other than `slug` is ignored if given). */
export function detectBadgeInstall(website: string | null | undefined, rows: readonly BadgeHitRow[], slug?: string): BadgeInstall {
  const domain = websiteDomain(website);
  const days = new Set<string>();
  const others = new Set<string>();
  for (const r of rows) {
    if (slug !== undefined && r.slug !== slug) continue;
    if (!(INSTALL_KINDS as readonly string[]).includes(r.kind)) continue;
    const ref = registrableDomain(r.referrer);
    if (!ref) continue; // no referrer, or not a hostname: proves nothing
    if (domain && ref === domain) days.add(r.day);
    else others.add(r.referrer.toLowerCase());
  }
  const sorted = [...days].sort();
  return {
    domain,
    detected: sorted.length >= INSTALL_MIN_DAYS,
    days: sorted.length,
    firstDay: sorted[0] ?? null,
    detectedOn: sorted[INSTALL_MIN_DAYS - 1] ?? null,
    lastDay: sorted.at(-1) ?? null,
    otherSites: [...others].sort(),
    ownDomain: isOwnOrTestDomain(domain),
  };
}

/** Group badge_hits rows by slug. */
export function groupBySlug(rows: readonly BadgeHitRow[]): Map<string, BadgeHitRow[]> {
  const out = new Map<string, BadgeHitRow[]>();
  for (const r of rows) {
    const list = out.get(r.slug);
    if (list) list.push(r);
    else out.set(r.slug, [r]);
  }
  return out;
}
