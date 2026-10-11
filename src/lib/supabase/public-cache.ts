import { retryTableRead, transientNetworkError } from "./read-retry";
import { CircuitOpenError, isCircuitOpen, isServerFailure, recordReadFailure, recordReadSuccess } from "./circuit";

/** Only the cookieless anonymous read client may use this policy. */
export const PUBLIC_DATA_TAG = "supabase-public-data";
export const PUBLIC_DATA_TTL = 300;
export const TAXONOMY_DATA_TAG = "supabase-public-taxonomy";
export const TAXONOMY_TABLES = new Set(["regions", "property_types", "trade_categories"]);
/** Forum reads get their own tag so a new reply doesn't purge the whole site's cache. */
export const FORUM_DATA_TAG = "supabase-public-forum";
export const isForumTable = (table: string) => table.startsWith("forum_");
/** The shared board snapshot (lib/data/board-snapshot) and everything derived from it. */
export const RFPS_TAG = "rfps";
/** Tables whose writes change the public board. */
export const RFP_TABLES = new Set(["rfp_posts", "rfp_categories", "rfp_documents"]);

type CachedInit = RequestInit & { next?: { revalidate?: number | false; tags?: string[] } };

export function createPublicReadFetch(baseUrl: string, anonKey: string, transport: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const origin = new URL(baseUrl).origin;
  return (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(request?.headers);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const anonymous = headers.get("apikey") === anonKey && headers.get("authorization") === `Bearer ${anonKey}`;
    // Exclude RPCs, Auth, Storage, writes and any unexpected user credentials.
    // Range/Accept headers and the complete URL remain part of Next's cache key.
    const publicRead = anonymous && method === "GET" && url.origin === origin &&
      /^\/rest\/v1\/[^/]+$/.test(url.pathname) && !headers.has("cookie");
    const options: CachedInit = { ...init, headers, cache: publicRead ? "force-cache" : "no-store" };
    const table = url.pathname.split("/").pop() ?? "";
    const taxonomy = TAXONOMY_TABLES.has(table);
    const tag = taxonomy ? TAXONOMY_DATA_TAG : isForumTable(table) ? FORUM_DATA_TAG : PUBLIC_DATA_TAG;
    if (publicRead) options.next = { revalidate: taxonomy ? 3600 : PUBLIC_DATA_TTL, tags: [tag] };
    else options.next = { revalidate: 0 };
    // Every render must invoke Next's patched fetch so its tags and TTL are
    // registered in that render's context. Let Next handle render-local fetch
    // memoization; do not bypass it with process-wide in-flight promises.
    if (!publicRead) return transport(input, options);
    // Safety net (incident 2026-10-09): fail fast while the database is
    // struggling, and never let one read hold a render for minutes.
    if (isCircuitOpen()) return Promise.reject(new CircuitOpenError());
    return withDeadline(retryTableRead(input, options, transport), PUBLIC_READ_TIMEOUT_MS).then(
      (response) => {
        if (isServerFailure(response.status)) recordReadFailure();
        else recordReadSuccess();
        return response;
      },
      (error: unknown) => {
        // Only "the database is unreachable or slow" trips the breaker, never a bad request.
        const timedOut = error instanceof Error && error.name === "AbortError";
        if (timedOut || transientNetworkError(error)) recordReadFailure();
        throw error;
      },
    );
  };
}

/** Upper bound for one public read (including our single retry). */
export const PUBLIC_READ_TIMEOUT_MS = 10_000;

/**
 * Rejects after `ms` without passing an AbortSignal into fetch: a signal
 * would switch off Next's render-local request de-duplication, multiplying
 * identical reads. The orphaned request still settles (and may fill the cache).
 */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Supabase public read exceeded ${ms} ms`);
      error.name = "AbortError"; // postgrest-js must not retry a timed-out read
      reject(error);
    }, ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
