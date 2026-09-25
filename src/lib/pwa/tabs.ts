/**
 * Which dashboard pages get a slot in the mobile bottom tab bar
 * (src/components/dashboard/app-tab-bar.tsx). Everything else in the nav
 * stays one tap away under "More". Pure so it can be unit tested.
 */

export type NavItem = { href: string; label: string };

export const TAB_SLOTS = 4;

/**
 * The daily-use pages, in tab order. Trade and PM navs never share an href,
 * so one list covers both; hrefs missing from a nav are skipped.
 */
export const PREFERRED_TABS: readonly string[] = [
  "/dashboard",
  "/dashboard/rfps",
  "/dashboard/saved-rfps",
  "/dashboard/interests",
  "/pm-dashboard",
  "/pm-dashboard/rfps",
  "/pm-dashboard/rfps/new",
  "/pm-dashboard/saved-vendors",
];

/** Short names that fit under a tab icon; anything else uses its nav label. */
const TAB_LABELS: Record<string, string> = {
  "/dashboard": "Home",
  "/dashboard/rfps": "Feed",
  "/dashboard/saved-rfps": "Saved",
  "/dashboard/interests": "Interests",
  "/pm-dashboard": "Home",
  "/pm-dashboard/rfps": "My RFPs",
  "/pm-dashboard/rfps/new": "Post",
  "/pm-dashboard/saved-vendors": "Trades",
};

/** Section roots only match exactly (same rule as SidebarNav), so Home doesn't light up on every sub-page. */
const SECTION_ROOTS = new Set(["/dashboard", "/pm-dashboard", "/admin"]);

/** Up to 4 tabs: the preferred pages this nav has, topped up in nav order (e.g. admin). */
export function pickTabs(nav: readonly NavItem[]): NavItem[] {
  const tabs = PREFERRED_TABS.flatMap((href) => nav.filter((item) => item.href === href));
  for (const item of nav) {
    if (tabs.length >= TAB_SLOTS) break;
    if (!tabs.includes(item)) tabs.push(item);
  }
  return tabs.slice(0, TAB_SLOTS);
}

export function tabLabel(item: NavItem): string {
  return TAB_LABELS[item.href] ?? item.label;
}

/**
 * The href the current page belongs to: an exact match, or the longest href
 * that prefixes the path at a "/" boundary. Null when none do.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const hit = pathname === href || (!SECTION_ROOTS.has(href) && pathname.startsWith(`${href}/`));
    if (hit && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
