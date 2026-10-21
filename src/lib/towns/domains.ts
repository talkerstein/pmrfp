/**
 * Public-buyer verification by government email domain. Pure, so it's unit
 * tested (test/unit/towns.test.ts).
 *
 * A clerk's claim of a buyer page is verified on the spot only when ALL hold:
 *  1. the page has no managing organization yet (otherwise: a join request
 *     to the people who already manage it, never a second organization);
 *  2. their email address is confirmed (they clicked the sign-in link);
 *  3. it isn't a free or personal mailbox (gmail, outlook, ISP mail…);
 *  4. its domain is one of the buyer's own domains (directory web/email
 *     domains, plus any an admin trusted for that buyer);
 *  5. that domain belongs to this buyer alone. A domain several buyers share
 *     (ontario.ca, gov.bc.ca, a health authority's agencies) proves nothing
 *     about which one, so it goes to review. A buyer's website domain beats
 *     a domain it only has an inbox on (calgary.ca is the City of Calgary's,
 *     not Calgary Housing Company's).
 * Anything else waits for a PMRFP admin at /admin/buyer-sources.
 */
import { FREE_MAIL } from "@/lib/claims/domain";

/** Two-label public suffixes (on.ca, gc.ca…): the registrable domain is one label deeper. */
const MULTI_SUFFIX = new Set(["on.ca", "qc.ca", "bc.ca", "ab.ca", "mb.ca", "sk.ca", "ns.ca", "nb.ca", "nl.ca", "nf.ca", "pe.ca", "yk.ca", "nt.ca", "nu.ca", "gc.ca"]);

/** Personal and ISP mailboxes that never prove who someone works for (on top of lib/claims FREE_MAIL). */
const MORE_FREE_MAIL = [
  "outlook.ca", "live.co.uk", "yahoo.co.uk", "rocketmail.com", "pm.me", "gmx.net", "gmx.ca", "mail.ru", "yandex.com",
  "inbox.com", "hushmail.com", "tutanota.com", "zohomail.com", "sasktel.net", "mts.net", "xplornet.com", "xplornet.ca",
  "nb.sympatico.ca", "ns.sympatico.ca", "on.aibn.com", "tbaytel.net", "persona.ca", "execulink.com", "netcom.ca",
  "eastlink.net", "bellaliant.net", "nl.rogers.com", "accesscomm.ca", "lightspeed.ca", "telusplanet.net", "cablevision.qc.ca",
];
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([...FREE_MAIL, ...MORE_FREE_MAIL]);

/** "https://www.city.oakville.on.ca/x", "clerk@town.cobourg.ca" → the registrable domain; null when it isn't one. */
export function registrableOf(input: string | null | undefined): string | null {
  let raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("@") && !/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = raw.split("@").pop() ?? "";
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return MULTI_SUFFIX.has(lastTwo) && parts.length >= 3 ? parts.slice(-3).join(".") : lastTwo;
}

/** A free or personal mailbox (also catches the full host: "nb.sympatico.ca"). */
export function isFreeMail(email: string): boolean {
  const host = (email.split("@")[1] ?? "").trim().toLowerCase();
  const reg = registrableOf(email);
  return FREE_MAIL_DOMAINS.has(host) || (reg != null && FREE_MAIL_DOMAINS.has(reg));
}

/** One buyer, as the domain index sees it. */
export interface DomainHolder {
  /** Same buyer across duplicate directory rows ("<provinceCode>|<coreKey>"). */
  identity: string;
  /** The buyer's website domain (its official bids page). */
  website: string | null;
  /** Every domain on file for the buyer (website first). */
  domains: readonly string[];
  /** Domains a PMRFP admin trusted for this buyer: they count like its website. */
  trusted?: readonly string[];
}

/** Domain → the buyer identities that own it (website owners first; inbox-only owners count only when no buyer has it as a website). */
export function domainOwners(holders: readonly DomainHolder[]): Map<string, Set<string>> {
  const web = new Map<string, Set<string>>();
  const other = new Map<string, Set<string>>();
  for (const h of holders) {
    for (const d of h.domains) {
      const map = d === h.website || h.trusted?.includes(d) ? web : other;
      if (!map.has(d)) map.set(d, new Set());
      map.get(d)!.add(h.identity);
    }
  }
  const out = new Map<string, Set<string>>(web);
  for (const [d, ids] of other) if (!out.has(d)) out.set(d, ids);
  return out;
}

export type PendingReason = "free_mail" | "email_unconfirmed" | "no_domain_on_file" | "domain_mismatch" | "shared_domain" | "bad_email";

export type ClaimDecision =
  | { kind: "join"; organizationId: string; domainMatch: boolean }
  | { kind: "verified"; domain: string }
  | { kind: "pending"; reason: PendingReason; domain: string | null };

export interface ClaimInput {
  email: string;
  /** Supabase Auth's email_confirmed_at is set. */
  emailConfirmed: boolean;
  buyer: DomainHolder;
  owners: ReadonlyMap<string, ReadonlySet<string>>;
  /** The organization that already manages this page, if any. */
  managedBy: string | null;
}

/** Does this email's domain belong to the buyer? (For the join request's reasons and the admin hint.) */
export function emailOnBuyerDomain(email: string, buyer: Pick<DomainHolder, "domains">): boolean {
  const d = registrableOf(email);
  return d != null && !isFreeMail(email) && buyer.domains.includes(d);
}

/** The one decision a claim gets (see the header). */
export function decideClaim(input: ClaimInput): ClaimDecision {
  const domain = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()) ? registrableOf(input.email) : null;
  if (input.managedBy) return { kind: "join", organizationId: input.managedBy, domainMatch: emailOnBuyerDomain(input.email, input.buyer) };
  if (!domain) return { kind: "pending", reason: "bad_email", domain: null };
  if (isFreeMail(input.email)) return { kind: "pending", reason: "free_mail", domain };
  if (!input.emailConfirmed) return { kind: "pending", reason: "email_unconfirmed", domain };
  if (!input.buyer.domains.length) return { kind: "pending", reason: "no_domain_on_file", domain };
  if (!input.buyer.domains.includes(domain)) return { kind: "pending", reason: "domain_mismatch", domain };
  const owners = input.owners.get(domain);
  if (!owners || owners.size !== 1 || !owners.has(input.buyer.identity)) return { kind: "pending", reason: "shared_domain", domain };
  return { kind: "verified", domain };
}
