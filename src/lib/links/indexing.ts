/**
 * Which company profiles search engines may index. Pure and unit-tested
 * (test/unit/profile-indexing.test.ts). A profile below the quality bar is
 * `noindex, follow` (and left out of the sitemap): it stays visible to people
 * and to the directory search, it just doesn't compete in Google.
 *
 * noindex when ANY of:
 *   - the listing is not approved
 *   - the spam check flagged it (organizations.risk_flagged)
 *   - it has nothing substantial: no description of at least 80 characters
 *     AND no logo AND no published project AND the owner's email is not on
 *     the company's own website domain
 * Everything else stays indexable.
 */
export const MIN_DESCRIPTION_CHARS = 80;

export interface IndexInput {
  approved: boolean;
  riskFlagged?: boolean | null;
  /** The longer of the short and full description, trimmed. */
  descriptionLength: number;
  hasLogo: boolean;
  projectCount: number;
  /** organizations.email_domain_verified. */
  emailDomainVerified?: boolean | null;
}

export function profileIndexable(p: IndexInput): boolean {
  if (!p.approved) return false;
  if (p.riskFlagged) return false;
  const thin = p.descriptionLength < MIN_DESCRIPTION_CHARS && !p.hasLogo && p.projectCount <= 0 && !p.emailDomainVerified;
  return !thin;
}

/** The longest of the descriptions a profile has, in characters. */
export function descriptionLength(...texts: (string | null | undefined)[]): number {
  return Math.max(0, ...texts.map((t) => (t ?? "").trim().length));
}
