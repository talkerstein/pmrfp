/**
 * Trusted-trades pages: a realtor's (or property manager's) shareable list of
 * PMRFP trades. Pure rules here; reads in ./data, writes in ./actions.
 */

/** Trades a free list can hold. Realtor Pro is unlimited. */
export const FREE_LIMIT = 5;

/** Roles that own a trusted-trades page (buyers, never trades). */
export const TRUSTED_ROLES = ["real_estate_agent", "property_manager"] as const;

const HANDLE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RESERVED = new Set(["new", "edit", "admin", "api", "pmrfp", "settings", "trusted", "about", "help"]);

/** Lower-case, dash-separated, 3–40 chars; null when it can't be made valid or is reserved. */
export function normalizeHandle(raw: string): string | null {
  const h = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return HANDLE.test(h) && !RESERVED.has(h) ? h : null;
}

/** First handle to try for a new page: the person's name, else their company. */
export function handleFromName(name: string | null | undefined, fallback: string | null | undefined): string {
  return normalizeHandle(name ?? "") ?? normalizeHandle(fallback ?? "") ?? "my-trusted-trades";
}

export function canAddTrade(count: number, pro: boolean): boolean {
  return pro || count < FREE_LIMIT;
}

/** A lapsed Pro list keeps its trades but shows only the free number publicly. */
export function visibleTrades<T>(items: T[], pro: boolean): T[] {
  return pro ? items : items.slice(0, FREE_LIMIT);
}

/** "Call or text" link target: digits and a leading + only. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? `tel:${digits}` : null;
}
