/**
 * "Just looking" (visitor) accounts that are really businesses.
 *
 * Real companies (pest control, cleaning) kept signing up as "visitor" and
 * never got listed. This file holds the pure rules for catching them and for
 * switching such an account to a business role:
 *  - looksLikeBusiness(): a business-looking name or email domain;
 *  - resolveVisitorUpgrade(): the guard for the switch (only ever FROM visitor);
 *  - tradeLeaningArrival(): whether the sign-up page may start on "I do the work".
 *
 * Pure and client-safe: no server imports.
 */
import type { UserRole } from "@/types/db";
import type { FirstTouch } from "@/lib/attribution/cookie";

/** Where a visitor account goes to list its business (also the /dashboard bounce). */
export const VISITOR_UPGRADE_PATH = "/account/list-business";

/** The roles a visitor account can switch to by itself: the ones that get a listing. */
export const BUSINESS_ROLES = ["trade", "supplier"] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export function parseBusinessRole(v: unknown): BusinessRole | null {
  return v === "trade" || v === "supplier" ? v : null;
}

export type VisitorUpgradeResult =
  | { ok: true; to: BusinessRole; changed: boolean }
  | { ok: false; reason: "not_visitor" | "invalid_role" };

/**
 * The guard for switching an account to a business role. Only a visitor can
 * be switched, only to trade or supplier. Asking again for the role the
 * account already has is fine (a second tab, a double click): ok, unchanged.
 * Any other role (PM, admin, talent, the other business role) is refused.
 */
export function resolveVisitorUpgrade(current: UserRole, choice: unknown): VisitorUpgradeResult {
  const to = parseBusinessRole(choice);
  if (!to) return { ok: false, reason: "invalid_role" };
  if (current === "visitor") return { ok: true, to, changed: true };
  if (current === to) return { ok: true, to, changed: false };
  return { ok: false, reason: "not_visitor" };
}

/** Personal mailbox providers: an address here says nothing about a business. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.ca", "ymail.com", "rocketmail.com",
  "hotmail.com", "hotmail.ca", "outlook.com", "outlook.ca", "live.com", "live.ca", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com", "proton.me", "pm.me",
  "gmx.com", "gmx.net", "mail.com", "yandex.com", "zoho.com", "fastmail.com", "hey.com",
  "rogers.com", "sympatico.ca", "bell.net", "shaw.ca", "telus.net", "videotron.ca", "cogeco.ca",
  "eastlink.ca", "sasktel.net", "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
]);

/** Government and school addresses: buyers or students, not companies to list. */
const PUBLIC_DOMAIN = /(^|\.)(gov|gc\.ca|edu|mil)$|(^|\.)(canada|ontario|quebec|toronto)\.ca$/;

/**
 * Words that show up in company names, not people's names (en / fr / es).
 * Kept to unambiguous ones: no "Snow", "Fire", "Co" (surnames and initials).
 */
const BUSINESS_WORDS =
  /\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|company|enterprises?|group|services?|solutions|cleaning|cleaners|janitorial|pest|exterminat\w*|plumbing|plumbers?|electric(al)?|electricians?|roofing|roofers?|hvac|heating|construction|contracting|contractors?|renovations?|reno|landscaping|painting|painters?|maintenance|restoration|mechanical|flooring|paving|movers|moving|waste|supply|supplies|ltée|ltee|enr|nettoyage|entretien|plomberie|toiture|rénovations?|limpieza|mantenimiento|plomería|construcción|servicios|empresa)\b/i;
/** Numbered companies: "2456789 Ontario Inc." */
const NUMBERED = /\b\d{6,}\s+(ontario|canada|quebec|québec|alberta|b\.?c\.?|manitoba|saskatchewan|nova scotia)\b/i;

/** The domain of an email address, lower-cased, or "" when it isn't one. */
export function emailDomain(email: unknown): string {
  const s = String(email ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1) return "";
  const d = s.slice(at + 1);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : "";
}

/**
 * True when a "just looking" sign-up probably runs a business: a company-ish
 * name ("Fresh One Cleaning", "GTA Pest Control Inc.") or an email on the
 * company's own domain. Only ever used to show a "list it free" nudge.
 */
export function looksLikeBusiness(i: { name?: unknown; email?: unknown; company?: unknown }): boolean {
  for (const n of [i.name, i.company]) {
    const s = String(n ?? "").trim();
    if (s && (BUSINESS_WORDS.test(s) || NUMBERED.test(s))) return true;
  }
  const d = emailDomain(i.email);
  return !!d && !FREE_MAIL.has(d) && !PUBLIC_DOMAIN.test(d);
}

/** Pages a trade company lands on (paths without the language prefix). */
const TRADE_PATHS = /^\/(rfps|for-trades|contract-winners|become-a-supplier|for\/suppliers|pricing|badges|reputation|weekly-email|services-for-trades|get-found|founding-500|trades)(\/|$)/;
/** Campaign words from trade outreach (the lifecycle, digest and badge emails, claim invites). */
const TRADE_UTM = /(trade|contractor|claim|badge|lifecycle|digest|tender|supplier|founding)/i;
/** Campaign words aimed at buyers: never start those on "I do the work". */
const BUYER_UTM = /(\bpm\b|pm[-_]|property|landlord|owner|condo|builder|\bgc\b|gc[-_]|buyer|realtor|real[-_ ]?estate)/i;

function stripLocale(path: string): string {
  const p = path.replace(/^\/(en|fr|es)(?=\/|$)/, "");
  return p || "/";
}

/**
 * Whether to start the sign-up page on "I do the work": the visitor came from
 * a trade page (this request's referrer, or the first page of their visit) or
 * from a trade outreach campaign. Buyer campaigns win over trade pages.
 */
export function tradeLeaningArrival(i: { referrerPath?: string | null; firstTouch?: FirstTouch | null }): boolean {
  const utm = i.firstTouch ? [i.firstTouch.utm, i.firstTouch.last ?? {}] : [];
  const tags = utm.flatMap((u) => [u.source, u.medium, u.campaign, u.content]).filter((x): x is string => !!x);
  if (tags.some((x) => BUYER_UTM.test(x))) return false;
  if (tags.some((x) => TRADE_UTM.test(x))) return true;
  for (const p of [i.referrerPath, i.firstTouch?.path]) {
    if (p && TRADE_PATHS.test(stripLocale(p))) return true;
  }
  return false;
}
