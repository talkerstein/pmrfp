/**
 * "Earn the link": PMRFP's link to a member's own website is a normal,
 * followed link only once the member has given PMRFP something real back.
 * Everyone else's website link is rel="nofollow ugc". Pure and unit-tested
 * (test/unit/link-policy.test.ts); every page that prints a member's website
 * goes through websiteLink() so the rule lives in one place.
 *
 * A member's link is earned when ALL of these hold:
 *   1. the listing is approved, not suspended and not held by the spam check;
 *   2. it has been live at least LINK_MIN_AGE_DAYS since approval;
 *   3. it has given PMRFP something back: an active paid plan (Trade Pro,
 *      Featured, lifetime / Founding 500; past-due and trials do not count),
 *      or our badge is detected on the member's own website
 *      (lib/badge/install: the badge loaded from that domain on 2+ days).
 * An admin can also mark a listing trusted (organizations.link_trusted:
 * house and sister companies). Trusted skips the age and "gave back" tests
 * but never overrides a suspended, rejected or unapproved listing.
 *
 * No copy anywhere promises rankings: this is a value exchange, not a deal
 * for search results.
 */

/** Days a listing must have been live before its website link can be followed. */
export const LINK_MIN_AGE_DAYS = 14;

export const REL_EARNED = "noopener noreferrer";
export const REL_UNEARNED = "noopener noreferrer nofollow ugc";

const DAY_MS = 86_400_000;

/** What the policy needs to know about a company. Every field optional: missing means "no". */
export interface LinkOrg {
  slug?: string | null;
  website?: string | null;
  profileStatus?: string | null;
  /** organizations.status ('active' | 'suspended' | 'deleted' ...). */
  status?: string | null;
  approvedAt?: string | Date | null;
  /** Admin override (organizations.link_trusted). */
  linkTrusted?: boolean | null;
  /** Active paid plan (organizations.link_paid, kept in step by lib/links/sync). */
  paid?: boolean | null;
  /** Badge detected on the member's own website (organizations.link_badge). */
  badgeInstalled?: boolean | null;
  /** The spam check flagged this listing (organizations.risk_flagged). */
  riskFlagged?: boolean | null;
}

function toMs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Whole days since approval, or null when it has no approval date. */
export function daysLive(org: Pick<LinkOrg, "approvedAt">, now: Date = new Date()): number | null {
  const t = toMs(org.approvedAt);
  if (t == null) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/** Suspended or deleted at the organization level, or suspended / rejected at the profile level. */
export function isBlockedOrg(org: Pick<LinkOrg, "profileStatus" | "status">): boolean {
  return org.status === "suspended" || org.status === "deleted" || org.profileStatus === "suspended" || org.profileStatus === "rejected";
}

export type LinkReason = "trusted" | "paid" | "badge";

export interface LinkStatus {
  earned: boolean;
  /** Why it is followed (trusted wins, then paid, then badge). Null when not earned. */
  reason: LinkReason | null;
  /** What is still missing when not earned, in the order a member should fix it. */
  missing: ("approval" | "age" | "signal" | "review")[];
  /** Days left until the age rule is met (0 when met or not approved). */
  daysToGo: number;
}

/** The whole decision, with the reasons the dashboard shows. */
export function linkStatus(org: LinkOrg, now: Date = new Date()): LinkStatus {
  const approved = org.profileStatus === "approved" && !isBlockedOrg(org);
  if (!approved) {
    return { earned: false, reason: null, missing: ["approval"], daysToGo: 0 };
  }
  if (org.linkTrusted) return { earned: true, reason: "trusted", missing: [], daysToGo: 0 };
  const missing: LinkStatus["missing"] = [];
  if (org.riskFlagged) missing.push("review");
  const live = daysLive(org, now);
  const daysToGo = live == null ? LINK_MIN_AGE_DAYS : Math.max(0, LINK_MIN_AGE_DAYS - live);
  if (live == null || live < LINK_MIN_AGE_DAYS) missing.push("age");
  const signal: LinkReason | null = org.paid ? "paid" : org.badgeInstalled ? "badge" : null;
  if (!signal) missing.push("signal");
  if (missing.length) return { earned: false, reason: null, missing, daysToGo };
  return { earned: true, reason: signal, missing: [], daysToGo: 0 };
}

/** True when the member's website link may be a followed link. */
export function linkEarned(org: LinkOrg, now: Date = new Date()): boolean {
  return linkStatus(org, now).earned;
}

/** The rel attribute for a link from PMRFP to this member's website. */
export function websiteRel(org: LinkOrg, now: Date = new Date()): string {
  return linkEarned(org, now) ? REL_EARNED : REL_UNEARNED;
}

/** A typed website as an absolute http(s) URL, or null when it isn't one. */
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || /[\s<>"]/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** The destination with utm_source=pmrfp.com, so the company sees PMRFP in its own analytics. */
export function withUtm(target: string): string {
  try {
    const u = new URL(target);
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set("utm_source", "pmrfp.com");
      u.searchParams.set("utm_medium", "referral");
    }
    return u.toString();
  } catch {
    return target;
  }
}

/** The path of the click-out redirect for a company. */
export function outPath(slug: string): string {
  return `/out/${encodeURIComponent(slug)}`;
}

export interface WebsiteLink {
  /** Where the anchor points: the website itself when earned, else PMRFP's counting redirect. */
  href: string;
  rel: string;
  earned: boolean;
  /** The site's address as shown ("acme.ca"). */
  label: string;
}

export function displayHost(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

/**
 * Everything a page needs to print a member's website link. Null when there
 * is no usable website (or, for an unearned link, no slug to count through).
 */
export function websiteLink(org: LinkOrg, now: Date = new Date()): WebsiteLink | null {
  const url = normalizeWebsiteUrl(org.website);
  if (!url) return null;
  const earned = linkEarned(org, now);
  if (earned) return { href: url, rel: REL_EARNED, earned: true, label: displayHost(url) };
  const slug = (org.slug ?? "").trim();
  // No slug to count through: still print it, nofollow, direct.
  return { href: slug ? outPath(slug) : url, rel: REL_UNEARNED, earned: false, label: displayHost(url) };
}

/** A member's website for structured data (JSON-LD url / sameAs): only when the link is earned. */
export function structuredDataUrl(org: LinkOrg, now: Date = new Date()): string | undefined {
  if (!linkEarned(org, now)) return undefined;
  return normalizeWebsiteUrl(org.website) ?? undefined;
}

/** The anchor attributes for a user-written link (forum posts, replies, reviews): always nofollow ugc. */
export const UGC_REL = "nofollow ugc noopener noreferrer";
