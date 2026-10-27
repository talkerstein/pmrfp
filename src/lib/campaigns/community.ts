/**
 * Community campaign links: an unlisted landing page per community group
 * (e.g. /welcome/ejt), shared only inside that group. Not in the sitemap,
 * noindex, and not linked from any navigation. Unlisted, not private: anyone
 * with the link can open it.
 *
 * The "offer" is free registration, which is free for everyone on PMRFP. The
 * campaign only changes the wording on /sign-up (a confirmation that the
 * group's link was used) and the attribution (utm_* on the shared link, kept
 * by the first-touch cookie). No price, plan or entitlement changes.
 */

export interface CommunityCampaign {
  /** Short code used in links: /welcome/<code>, /sign-up?campaign=<code>. */
  code: string;
  /** The group's name as members know it. */
  group: string;
  /** The landing page path (English only). */
  path: string;
}

export const COMMUNITY_CAMPAIGNS = {
  ejt: { code: "ejt", group: "Everything Jewish Toronto", path: "/welcome/ejt" },
} as const satisfies Record<string, CommunityCampaign>;

export type CommunityCode = keyof typeof COMMUNITY_CAMPAIGNS;

/** `?campaign=` → the campaign, or null for anything unknown. */
export function parseCommunityCampaign(v: unknown): CommunityCampaign | null {
  if (typeof v !== "string") return null;
  return Object.prototype.hasOwnProperty.call(COMMUNITY_CAMPAIGNS, v) ? COMMUNITY_CAMPAIGNS[v as CommunityCode] : null;
}

/** The sign-up link from a campaign page, starting on a role when given. */
export function communitySignUpHref(code: CommunityCode, role?: string): string {
  return `/sign-up?${role ? `role=${role}&` : ""}campaign=${code}`;
}

/** The confirmation shown on /sign-up when a campaign link was used. */
export function communityOfferNote(c: CommunityCampaign): string {
  return `${c.group} link applied: free registration, no card needed.`;
}
