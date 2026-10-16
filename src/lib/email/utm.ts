/**
 * UTM tags on the links in OUR emails that point back at pmrfp.com, so a
 * visit (and a sign-up) from an email shows up as "email" in
 * /admin/signups. Pure and unit-tested.
 *
 * Left untouched: links to other sites, links that already carry utm_*,
 * /api/ links (one-click unsubscribe, confirm and keep-alive links are
 * signed; nothing should change them) and /go/ redirects (sponsor and
 * partner click-outs keep their own tags).
 */

const OWN_ORIGINS = ["https://pmrfp.com", "https://www.pmrfp.com"];

/** `href` with our email tags. `amp`: separators written as &amp; (inside an HTML attribute). */
export function emailUtmUrl(href: string, campaign: string, amp = false): string {
  const and = amp ? "&amp;" : "&";
  const hashAt = href.indexOf("#");
  const beforeHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const sep = beforeHash.includes("?") ? and : "?";
  const tags = ["utm_source=pmrfp", "utm_medium=email", `utm_campaign=${encodeURIComponent(campaign)}`].join(and);
  return `${beforeHash}${sep}${tags}${hash}`;
}

function isOwnLink(url: string, origins: readonly string[]): boolean {
  const o = origins.find((b) => url === b || url.startsWith(`${b}/`) || url.startsWith(`${b}?`) || url.startsWith(`${b}#`));
  if (!o) return false;
  const path = url.slice(o.length);
  if (/^\/(?:(?:en|fr|es)\/)?(api|go)(\/|\?|#|$)/.test(path)) return false;
  return !/[?&](amp;)?utm_[a-z]+=/i.test(url);
}

/** Adds utm_source=pmrfp&utm_medium=email&utm_campaign=<campaign> to our links in an email's HTML. */
export function tagEmailLinks(html: string, campaign: string, base?: string): string {
  const c = campaign.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 60);
  if (!c) return html;
  const origins = [...new Set([...(base ? [base.replace(/\/+$/, "")] : []), ...OWN_ORIGINS])];
  return html.replace(/href="([^"]+)"/g, (m, url: string) => {
    if (!isOwnLink(url, origins)) return m;
    return `href="${emailUtmUrl(url, c, true)}"`;
  });
}
