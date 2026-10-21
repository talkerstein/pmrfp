/**
 * Small, dependency-free pieces of the "list your tenders free" flow that
 * client components use too (no zod here): the page path, the email address
 * notices go to, the honeypot name and the mailto: fallback.
 */

/** Where notices go when a buyer emails them (never another mailbox). */
export const NOTICES_EMAIL = "info@pmrfp.com";

export const FOR_PUBLIC_BUYERS_PATH = "/for-public-buyers";

/** The honeypot field: people never see it, bots fill it. */
export const HONEYPOT = "company_website";

/** "Are you this buyer?" link from a buyer page: the form, prefilled with that buyer. */
export function listYourTendersHref(p: { buyerSlug: string; provinceCode: string }): string {
  return `${FOR_PUBLIC_BUYERS_PATH}?buyer=${encodeURIComponent(p.buyerSlug)}&province=${encodeURIComponent(p.provinceCode)}#form`;
}

/** mailto: fallback (the table isn't there yet, or the form can't be used), prefilled with what they typed. */
export function mailtoFallback(subject: string, fields: Partial<Record<string, string>>): string {
  const body = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `mailto:${NOTICES_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
}

/** Does the work email's domain match the tenders page's domain? A hint for the admin, never a block. */
export function emailMatchesSite(email: string, url: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  if (!domain) return false;
  return domain === host || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`);
}
