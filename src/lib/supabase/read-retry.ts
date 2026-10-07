/** One fast recovery attempt for public table reads; never replay mutations or RPCs. */
const TRANSIENT_CODES = new Set([
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN",
  "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
]);
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

function transientNetworkError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const item = current as { code?: string; cause?: unknown };
    if (item.code && TRANSIENT_CODES.has(item.code)) return true;
    current = item.cause;
  }
  return false;
}

export async function retryTableRead(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  transport: typeof fetch,
): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const signal = init.signal ?? request?.signal;
  const path = new URL(request?.url ?? String(input)).pathname;
  const sdkRetry = Number(new Headers(init.headers).get("x-retry-count") ?? "0");
  if (sdkRetry > 0) {
    // supabase-js already retries up to three times. Do not nest our retry
    // inside those attempts; bound their connection wait instead.
    const deadline = AbortSignal.timeout(5000);
    const response = await transport(input, { ...init, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    console.info("supabase_read_retry", { path, outcome: response.ok ? "sdk_recovered" : "sdk_http_error", status: response.status });
    return response;
  }
  try {
    const response = await transport(input, init);
    if (!TRANSIENT_STATUSES.has(response.status) || signal?.aborted) return response;
    // Release the failed connection before trying again.
    await response.body?.cancel();
  } catch (error) {
    if (signal?.aborted || !transientNetworkError(error)) throw error;
  }

  await new Promise((resolve) => setTimeout(resolve, 100 + Math.floor(Math.random() * 150)));
  signal?.throwIfAborted();
  // A fresh signal bypasses Next's render memoization of a rejected fetch.
  // Keep the URL, headers, cache policy and tags unchanged for the Data Cache.
  const deadline = AbortSignal.timeout(5000);
  const retrySignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const response = await transport(input, { ...init, signal: retrySignal });
    console.info("supabase_read_retry", { path, outcome: response.ok ? "recovered" : "http_error", status: response.status });
    return response;
  } catch (error) {
    console.warn("supabase_read_retry", { path, outcome: "failed" });
    throw error;
  }
}

/** Auth verification is a GET; token refresh/sign-in/sign-out must never replay. */
export function createAuthReadFetch(baseUrl: string, transport: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const origin = new URL(baseUrl).origin;
  return (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const options = { ...init, cache: "no-store" as const };
    return method === "GET" && url.origin === origin && url.pathname === "/auth/v1/user"
      ? retryTableRead(input, options, transport)
      : transport(input, options);
  };
}
