/**
 * Pure helpers for first-party project reviews.
 */

export interface PublicReview {
  id: string;
  organizationId: string;
  caseStudyId: string | null;
  /** Full name with consent, otherwise first name + last initial (done in SQL). */
  name: string;
  /** Only present when the reviewer said we may show it. */
  company: string | null;
  rating: number;
  body: string;
  verifiedVia: string | null;
  reply: string | null;
  createdAt: string;
}

/** Count + average (1 decimal) for display and schema.org aggregateRating. */
export function reviewStats(reviews: { rating: number }[]): { count: number; average: number } {
  const valid = reviews.filter((r) => Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5);
  if (valid.length === 0) return { count: 0, average: 0 };
  const sum = valid.reduce((s, r) => s + r.rating, 0);
  return { count: valid.length, average: Math.round((sum / valid.length) * 10) / 10 };
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.ca", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
  "shaw.ca", "rogers.com", "sympatico.ca", "bell.net", "telus.net", "videotron.ca", "cogeco.ca",
]);

export function emailDomain(email: string | null | undefined): string | null {
  const m = /@([^@\s]+)$/.exec((email ?? "").trim().toLowerCase());
  return m ? m[1] : null;
}

function websiteDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Exact match with the trade's own addresses: never allowed as a reviewer. */
export function isOwnEmail(email: string, own: (string | null | undefined)[]): boolean {
  const e = email.trim().toLowerCase();
  return own.some((o) => o && o.trim().toLowerCase() === e);
}

/**
 * Looks like the trade reviewing itself: same address, or same company
 * domain as the trade's email or website (free-mail domains don't count).
 * Shown to the moderator as a warning, not an automatic reject.
 */
export function looksLikeSelfReview(
  reviewerEmail: string | null | undefined,
  org: { email?: string | null; website?: string | null; userEmails?: (string | null | undefined)[] },
): boolean {
  if (!reviewerEmail) return false;
  if (isOwnEmail(reviewerEmail, [org.email, ...(org.userEmails ?? [])])) return true;
  const d = emailDomain(reviewerEmail);
  if (!d || FREE_MAIL.has(d)) return false;
  return d === emailDomain(org.email) || d === websiteDomain(org.website);
}
