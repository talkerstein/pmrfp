/**
 * OPEN DATA: polite fetching for the official open-data APIs only (CKAN
 * datastore_search, Socrata /resource, ArcGIS REST /query). Named
 * User-Agent "PMRFP-data (info@pmrfp.com)", at most one request per second
 * per host, a timeout, and a hard request cap per run so a bug can never
 * hammer a publisher. No HTML scraping anywhere in src/lib/open-data.
 *
 * Opendatasoft hosts that bar bots from /api/ in robots.txt (Vancouver) are
 * deliberately NOT fetched: see vancouver.ts.
 */
import { OPEN_DATA_UA } from "./permits";

const lastHit = new Map<string, number>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpenDataFetchOpts {
  /** Minimum gap between two requests to the same host. */
  delayMs?: number;
  timeoutMs?: number;
}

/** Counts requests per run; throws past `max` (a runaway pagination loop). */
export class RequestBudget {
  used = 0;
  constructor(readonly max = 60) {}
  take(): void {
    if (++this.used > this.max) throw new Error(`open-data: more than ${this.max} requests in one run, stopping`);
  }
}

export async function openDataJson<T>(url: string, budget: RequestBudget, opts: OpenDataFetchOpts = {}): Promise<T> {
  budget.take();
  const host = new URL(url).hostname;
  const gap = opts.delayMs ?? 1100;
  const left = (lastHit.get(host) ?? 0) + gap - Date.now();
  if (left > 0) await wait(left);
  lastHit.set(host, Date.now());
  const res = await fetch(url, {
    headers: { "User-Agent": OPEN_DATA_UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!res.ok) throw new Error(`${host} HTTP ${res.status}`);
  return (await res.json()) as T;
}
