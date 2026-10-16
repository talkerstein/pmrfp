/**
 * Polite fetching for the history importers: one request at a time per
 * host, the named PMRFP User-Agent, and each host's robots.txt crawl delay
 * (Données Québec and Montréal ask for 10 s, open.canada.ca 20 s, Socrata
 * hosts 1 s). Only URLs robots.txt allows are ever requested: every source
 * module documents its endpoint and the rule that permits it.
 *
 * Local development: when AWARD_HISTORY_LOCAL_DIR is set (never in
 * production), a URL whose file name exists in that folder is read from
 * disk instead, so repeated dry runs don't download a 640 MB file twice.
 */
import { HISTORY_UA } from "./model";

/** Seconds between two requests to the same host (robots.txt Crawl-delay, or our own floor). */
export const CRAWL_DELAY_S: Record<string, number> = {
  "open.canada.ca": 20,
  "www.donneesquebec.ca": 10,
  "donnees.montreal.ca": 10,
  "data.texas.gov": 1,
  "api.usaspending.gov": 1,
  "files.usaspending.gov": 1,
  "ckan0.cf.opendata.inter.prod-toronto.ca": 1,
  "services.arcgis.com": 1,
};
const DEFAULT_DELAY_S = 1;

const lastHit = new Map<string, number>();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function politeTurn(url: string): Promise<void> {
  const host = new URL(url).hostname;
  const delay = (CRAWL_DELAY_S[host] ?? DEFAULT_DELAY_S) * 1000;
  const last = lastHit.get(host);
  if (last !== undefined) {
    const left = last + delay - Date.now();
    if (left > 0) await wait(left);
  }
  lastHit.set(host, Date.now());
}

function localFile(url: string): string | null {
  const dir = process.env.AWARD_HISTORY_LOCAL_DIR;
  if (!dir || process.env.NODE_ENV === "production" || process.env.VERCEL) return null;
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  return name ? `${dir.replace(/[\\/]+$/, "")}/${name}` : null;
}

export interface FetchOpts {
  method?: "GET" | "POST";
  body?: string;
  accept?: string;
  timeoutMs?: number;
  contentType?: string;
}

/** A response body as a stream (big CSVs), honoring the crawl delay. */
export async function politeStream(url: string, opts: FetchOpts = {}): Promise<ReadableStream<Uint8Array>> {
  const local = localFile(url);
  if (local) {
    const fs = await import("node:fs");
    if (fs.existsSync(local)) {
      const { Readable } = await import("node:stream");
      return Readable.toWeb(fs.createReadStream(local)) as unknown as ReadableStream<Uint8Array>;
    }
  }
  const res = await politeFetch(url, opts);
  if (!res.body) throw new Error(`${new URL(url).hostname}: empty body`);
  return res.body;
}

export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  await politeTurn(url);
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    body: opts.body,
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 240_000),
    headers: {
      "User-Agent": HISTORY_UA,
      Accept: opts.accept ?? "application/json, text/csv;q=0.9, */*;q=0.5",
      ...(opts.contentType ? { "Content-Type": opts.contentType } : {}),
    },
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} HTTP ${res.status}`);
  return res;
}

export async function politeText(url: string, opts: FetchOpts = {}): Promise<string> {
  const local = localFile(url);
  if (local) {
    const fs = await import("node:fs");
    if (fs.existsSync(local)) return fs.readFileSync(local, "utf8");
  }
  return (await politeFetch(url, opts)).text();
}

export async function politeJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  return JSON.parse(await politeText(url, opts)) as T;
}

export async function politeBytes(url: string, opts: FetchOpts = {}): Promise<Uint8Array> {
  const local = localFile(url);
  if (local) {
    const fs = await import("node:fs");
    if (fs.existsSync(local)) return new Uint8Array(fs.readFileSync(local));
  }
  return new Uint8Array(await (await politeFetch(url, opts)).arrayBuffer());
}
