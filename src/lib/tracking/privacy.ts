/**
 * Who and what first-party tracking never records. Pure and unit-tested; the
 * proxy, the beacon and the server helper all use it.
 *
 *  - Bots and crawlers (the proxy's user-agent pattern, now shared here).
 *  - Browsers that send Do-Not-Track (`DNT: 1`) or Global Privacy Control
 *    (`Sec-GPC: 1`): no attribution cookie, no page or listing views, no
 *    funnel events from their requests.
 *  - The website widgets (/embed/*, framed on other people's sites), the
 *    API, the sign-in callback and the admin area.
 */

/** Same pattern the proxy has always used to skip bots. */
export const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|embedly|preview|lighthouse|headless/i;

/** No user agent at all is a script, not a person. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = String(ua ?? "").trim();
  return !s || BOT_UA.test(s);
}

interface HeaderBag {
  get(name: string): string | null | undefined;
}

/** DNT: 1 or Sec-GPC: 1 on the request. */
export function optedOut(h: HeaderBag | null | undefined): boolean {
  if (!h) return false;
  return String(h.get("dnt") ?? "").trim() === "1" || String(h.get("sec-gpc") ?? "").trim() === "1";
}

/** The browser-side equivalents (navigator.doNotTrack / globalPrivacyControl). */
export function browserOptedOut(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | null | undefined, win?: { doNotTrack?: string | null } | null): boolean {
  if (!nav) return false;
  if (nav.globalPrivacyControl === true) return true;
  const dnt = nav.doNotTrack ?? win?.doNotTrack ?? null;
  return dnt === "1" || dnt === "yes";
}

const UNTRACKED = /^\/(?:(?:en|fr|es)\/)?(?:embed|api|auth|admin|out|go|_next)(?:\/|$)/;

/** Pages whose views we count (not the widgets, the API, auth or admin). */
export function trackablePath(path: string | null | undefined): boolean {
  const p = String(path ?? "");
  return p.startsWith("/") && !UNTRACKED.test(p);
}
