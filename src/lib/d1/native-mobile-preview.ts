import { handleNativeAuthPreview, nativePreviewTokenPattern } from "./native-auth-preview";

const operations = {
  "mobile-sign-in": "sign-in",
  "mobile-session": "session",
  "mobile-sign-out": "sign-out",
  "mobile-saved-rfps": "saved-rfps",
  "mobile-interest": "interest",
} as const;

type MobileOperation = keyof typeof operations;
const privateHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const mobileToken = (token: string) => token.length <= 512 && nativePreviewTokenPattern.test(token);
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: privateHeaders });

export function isNativeMobileOperation(value: string): value is MobileOperation {
  return Object.hasOwn(operations, value);
}

/** HTTPS transport for the native app rehearsal. Gateway keys stay on the server. */
export async function handleNativeMobilePreview(
  request: Request, operation: MobileOperation, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (env.PMRFP_NATIVE_MOBILE_PREVIEW !== "enabled" || env.VERCEL_ENV !== "preview") return fail("not_found", 404);
  const url = new URL(request.url);
  const buyerRead = operation === "mobile-interest" && request.method === "GET";
  if (url.protocol !== "https:" || (url.search && !buyerRead) || request.headers.has("origin")) return fail("invalid_request", 400);

  const target = operations[operation];
  const allowedMethods = target === "saved-rfps" || target === "interest" ? ["GET", "POST"] : [target === "session" ? "GET" : "POST"];
  if (!allowedMethods.includes(request.method)) return fail("method_not_allowed", 405);
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (target !== "sign-in" && !mobileToken(token)) return fail("sign_in_required", 401);

  const bridgeHeaders = new Headers({ origin: url.origin });
  if (target !== "sign-in") bridgeHeaders.set("cookie", "pmrfp-native-preview=" + token);
  let body: BodyInit | null = null;
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (target !== "sign-out" && !contentType.toLowerCase().startsWith("application/json")) return fail("invalid_request", 400);
    bridgeHeaders.set("content-type", "application/json");
    body = target === "sign-out" ? "{}" : request.body;
  }

  const bridge = new Request(url, {
    method: request.method, headers: bridgeHeaders, body, duplex: "half",
  } as RequestInit);
  const response = await handleNativeAuthPreview(bridge, target, env, fetcher);
  if (!response.ok || target === "session" || target === "saved-rfps" || target === "interest") return response;
  if (target === "sign-out") return Response.json({ ok: true }, { headers: privateHeaders });

  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /^pmrfp-native-preview=([^;]+);/.exec(setCookie);
  if (!match || !mobileToken(match[1])) return fail("native_preview_unavailable", 503);
  const { user } = await response.json();
  return Response.json({ user, accessToken: match[1] }, { headers: privateHeaders });
}
