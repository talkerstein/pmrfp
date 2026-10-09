/**
 * Who can see a project (pure, shared by server, client and tests).
 *
 *   public    profile, /projects gallery, search engines, sitemap
 *   unlisted  anyone with the link; listed nowhere and noindexed
 *   private   the company only, plus share links it hands out (Trade Pro)
 *
 * The database enforces the same rule (migration 20261009000002): anon can
 * read published public/unlisted rows; private rows only reach members, and
 * share links are resolved server-side with the service role.
 */

export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** New projects start public: that's what fills the profile and the gallery. */
export const DEFAULT_VISIBILITY: Visibility = "public";

/** Anything unknown (or a row from before the migration) is public, as it always was. */
export function normalizeVisibility(raw: unknown): Visibility {
  return typeof raw === "string" && (VISIBILITIES as readonly string[]).includes(raw) ? (raw as Visibility) : DEFAULT_VISIBILITY;
}

/** Private projects and share links are Trade Pro; public and unlisted are for everyone. */
export function canUseVisibility(paid: boolean, v: Visibility): boolean {
  return v !== "private" || paid;
}

/** Shows on the profile, in the gallery, in lists and in the sitemap. */
export function isListed(v: Visibility): boolean {
  return v === "public";
}

/** Search engines may index the page (public only). */
export function isIndexable(v: Visibility): boolean {
  return v === "public";
}

/** The slug URL works for anyone (public and unlisted). Private needs a share link. */
export function opensBySlug(v: Visibility): boolean {
  return v !== "private";
}

/** Share links: Trade Pro creates them; the project must be live to resolve. */
export function canCreateShareLink(paid: boolean, status: string): boolean {
  return paid && status === "published";
}

/** How many live links one project may have at once (a bid each, not a mailing list). */
export const MAX_SHARE_LINKS_PER_PROJECT = 10;
