/**
 * Which site loaded a badge image: the Referer header cut down to a bare
 * domain ("acmepaving.ca"). Only the domain is kept — never the path, query
 * or anything about the visitor. Pure, unit-tested.
 *
 *  - "" when the browser sent no referrer (email clients, strict privacy
 *    settings, some site builders);
 *  - null for PMRFP's own pages (the badge page preview) and local or
 *    preview hosts, which are not installs.
 */
const OWN = /(^|\.)pmrfp\.com$|(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$|^\[?::1\]?$/;

export function referrerDomain(header: string | null | undefined): string | null {
  const raw = (header ?? "").trim();
  if (!raw) return "";
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!host || OWN.test(host)) return null;
  // Hostnames only (letters, digits, dots, dashes); anything else is noise.
  if (!/^[a-z0-9.-]{1,120}$/.test(host)) return "";
  return host;
}
