import { registrableDomain } from "@/lib/badge/install";

/**
 * What an admin types into /admin/blocked-domains ("https://www.bad-seo.com/x",
 * "name@bad-seo.com", "Bad-SEO.com") as the one domain we store, or null when
 * it isn't a domain. Subdomains collapse to the registrable domain
 * (blog.bad-seo.com -> bad-seo.com), except site-builder hosts where each
 * customer is a subdomain. Pure and unit-tested.
 */
export function normalizeBlockedDomain(raw: string | null | undefined): string | null {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s || s.length > 253) return null;
  const at = s.lastIndexOf("@");
  if (at >= 0) s = s.slice(at + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^www\./, "");
  s = s.split(/[/?#:]/)[0] ?? "";
  if (!s || /\s/.test(s) || !s.includes(".")) return null;
  return registrableDomain(s);
}
