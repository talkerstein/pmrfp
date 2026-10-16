/**
 * Whether any PMRFP job may download from canadabuys.canada.ca.
 *
 * canadabuys.canada.ca/robots.txt (re-checked 2026-10-16) allows only
 * Googlebot and bingbot; every other user agent gets "Disallow: /". The
 * open.canada.ca records for the same datasets (tender notices
 * 6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2, award notices
 * a1acb126-9ce8-40a9-b889-5da2b1dd20cb, contract history
 * 4fe645a1-ffcd-40c1-9385-2c771be956a4) carry no copy of their own: every
 * resource URL, and open.canada.ca's /download/ link, redirects to
 * canadabuys.canada.ca/opendata/pub/. So there is no robots-compliant mirror.
 *
 * Default: OFF. The open-tender, past-contract and closed-tender imports
 * then run only from files an admin downloads in a browser and uploads at
 * /admin/canadabuys (the same parsers and sync run on the upload).
 *
 * CANADABUYS_DIRECT_FETCH=1 turns the automated download back on. Only set
 * it after the Government of Canada (PSPC / CanadaBuys) has said in writing
 * that PMRFP's job may fetch the files, or after robots.txt changes.
 */

export const CANADABUYS_HOST = "canadabuys.canada.ca";
export const CANADABUYS_FLAG = "CANADABUYS_DIRECT_FETCH";

/** Feed keys whose cron download is gated by the flag. */
export const CANADABUYS_FEED_KEYS = ["canadabuys", "awards", "canadabuys-closed"] as const;

export const CANADABUYS_OFF_NOTE =
  "off: canadabuys.canada.ca robots.txt disallows bots; upload the files at /admin/canadabuys (or set CANADABUYS_DIRECT_FETCH=1 once permission is granted)";

export function canadabuysFetchAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env[CANADABUYS_FLAG] === "1";
}

export class CanadabuysFetchDisabledError extends Error {
  constructor(url: string) {
    super(`Not fetching ${url}: ${CANADABUYS_OFF_NOTE}`);
    this.name = "CanadabuysFetchDisabledError";
  }
}

/**
 * The only way PMRFP code downloads from canadabuys.canada.ca. Throws
 * (without making a request) unless the flag is on.
 */
export async function canadabuysFetch(url: string): Promise<Response> {
  if (new URL(url).hostname !== CANADABUYS_HOST) throw new Error(`canadabuysFetch: not a CanadaBuys URL (${url})`);
  if (!canadabuysFetchAllowed()) throw new CanadabuysFetchDisabledError(url);
  // CanadaBuys' firewall 403s the default "node" User-Agent (verified
  // 2026-09-22); an honest identifying UA is accepted.
  return fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
}

/**
 * The sources a cron run may fetch. CanadaBuys feeds are left out unless the
 * flag is on, so their rows are neither refreshed nor archived by the cron
 * (the admin upload keeps them current instead).
 */
export function allowedSources<T extends { key: string }>(sources: T[], allow = canadabuysFetchAllowed()): T[] {
  if (allow) return sources;
  const gated = new Set<string>(CANADABUYS_FEED_KEYS);
  return sources.filter((s) => !gated.has(s.key));
}
