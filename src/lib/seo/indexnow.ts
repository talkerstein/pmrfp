import { SITE } from "@/lib/site";

/**
 * IndexNow (Bing, Yandex, Seznam, Naver…): tell search engines a URL changed
 * instead of waiting for a crawl. Google does not use IndexNow.
 *
 * The key is public by design: it must be served at /<key>.txt (public/).
 * Rotate by adding a new public/<key>.txt and setting INDEXNOW_KEY.
 */
export const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "26ea43f99c7dc6b3dd4c65025e93231a";
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** Protocol limit per request. */
const MAX_URLS = 10_000;

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
}

/** Absolute, same-host, de-duplicated URLs only (IndexNow rejects other hosts). */
export function normalizeIndexNowUrls(urls: string[], base = siteBase()): string[] {
  const host = new URL(base).host;
  const out = new Set<string>();
  for (const u of urls) {
    try {
      const abs = new URL(u, base);
      if (abs.host === host) out.add(abs.toString());
    } catch {
      /* skip junk */
    }
  }
  return [...out].slice(0, MAX_URLS);
}

export interface IndexNowResult {
  submitted: number;
  status: number | null;
  skipped?: string;
}

/**
 * Submit URLs. Never throws: indexing pings must not break the caller.
 * Skips outside production unless `force` is set, so previews don't ping.
 */
export async function submitIndexNow(urls: string[], opts: { force?: boolean } = {}): Promise<IndexNowResult> {
  const base = siteBase();
  const list = normalizeIndexNowUrls(urls, base);
  if (!list.length) return { submitted: 0, status: null, skipped: "no urls" };
  if (!opts.force && process.env.VERCEL_ENV !== "production") {
    return { submitted: 0, status: null, skipped: "not production" };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(base).host,
        key: INDEXNOW_KEY,
        keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
        urlList: list,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return { submitted: list.length, status: res.status };
  } catch (e) {
    return { submitted: 0, status: null, skipped: e instanceof Error ? e.message : "fetch failed" };
  }
}
