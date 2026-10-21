/**
 * Paths of the public-buyer flow. Dependency-free, so client and server
 * code share them.
 */

export const PUBLIC_BUYER_ROLE = "public_buyer" as const;

export const BUYER_DASHBOARD_PATH = "/buyer-dashboard";
export const BUYER_PAGE_EDIT_PATH = "/buyer-dashboard/edit";

/** "Claim this page free": the public-buyer sign-up, with the page to claim. */
export function claimSignUpHref(key: string | null): string {
  const q = new URLSearchParams({ role: PUBLIC_BUYER_ROLE });
  if (key) q.set("claim", key);
  return `/sign-up?${q.toString()}`;
}

/** The claim step at onboarding, for a page. */
export function claimOnboardingHref(key: string | null, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ ...(key ? { claim: key } : {}), ...extra });
  const s = q.toString();
  return s ? `/onboarding?${s}` : "/onboarding";
}
