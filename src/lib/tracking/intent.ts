/**
 * Which clicks count as "upgrade_clicked". Pure and client-safe.
 *
 * Any element (or its ancestor) with data-track="upgrade_clicked" counts,
 * with its data-plan. So does any link into a purchase path, wherever it
 * sits, so CTAs added later are counted without remembering to tag them:
 *   /sign-up?plan=pro|featured (the pricing cards), /dashboard/billing,
 *   /checkout, /dashboard/trial, /founding-500, /intel/upgrade.
 */

const PURCHASE_PATHS: [RegExp, string][] = [
  [/^\/dashboard\/billing(?:\/|$)/, "billing"],
  [/^\/dashboard\/trial(?:\/|$)/, "trial"],
  [/^\/checkout(?:\/|$)/, "checkout"],
  [/^\/founding-500(?:\/|$)/, "founding"],
  [/^\/intel\/upgrade(?:\/|$)/, "intel"],
];

/** The plan a link's href leads to buying, or null when it isn't an upgrade link. */
export function upgradeIntent(href: string | null | undefined, origin = "https://pmrfp.com"): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  const path = url.pathname.replace(/^\/(?:en|fr|es)(?=\/|$)/, "") || "/";
  const plan = url.searchParams.get("plan");
  if (/^\/sign-up(?:\/|$)/.test(path)) return plan === "pro" || plan === "featured" || plan === "seo" ? (plan === "seo" ? "pro" : plan) : null;
  for (const [re, label] of PURCHASE_PATHS) {
    if (re.test(path)) return plan === "pro" || plan === "featured" ? plan : label;
  }
  return null;
}
