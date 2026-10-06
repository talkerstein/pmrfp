/** Only the cookieless anonymous read client may use this policy. */
export const PUBLIC_DATA_TAG = "supabase-public-data";
export const PUBLIC_DATA_TTL = 300;
export const TAXONOMY_DATA_TAG = "supabase-public-taxonomy";
export const TAXONOMY_TABLES = new Set(["regions", "property_types", "trade_categories"]);

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
    const taxonomy = TAXONOMY_TABLES.has(url.pathname.split("/").pop() ?? "");
    if (publicRead) options.next = { revalidate: taxonomy ? 3600 : PUBLIC_DATA_TTL, tags: [taxonomy ? TAXONOMY_DATA_TAG : PUBLIC_DATA_TAG] };
    else options.next = { revalidate: 0 };
    // Every render must invoke Next's patched fetch so its tags and TTL are
    // registered in that render's context. Let Next handle render-local fetch
    // memoization; do not bypass it with process-wide in-flight promises.
    return transport(input, options);
  };
}
