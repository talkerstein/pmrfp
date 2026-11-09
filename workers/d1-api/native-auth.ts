import { D1ApiError, UUID } from "../../src/lib/d1/contracts";

export interface NativeSyntheticAuthConfig {
  NATIVE_AUTH_SERVICE?: { fetch: typeof fetch };
  NATIVE_AUTH_URL?: string;
  NATIVE_AUTH_GATEWAY_SECRET?: string;
}
const ORIGIN = "https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev";
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A native-session bridge for isolated synthetic application flows only.
 * The sealed real-account database is deliberately not a serving provider. */
export async function verifyNativeSyntheticIdentity(
  request: Request, env: NativeSyntheticAuthConfig, fetcher: typeof fetch,
): Promise<{ id: string; email: string }> {
  if (env.NATIVE_AUTH_URL !== ORIGIN || !env.NATIVE_AUTH_GATEWAY_SECRET || env.NATIVE_AUTH_GATEWAY_SECRET.length < 32) throw new D1ApiError(503, "native_auth_configuration_unavailable");
  // Forward only the signed session cookie, never unrelated application cookies.
  const cookie = request.headers.get("x-pmrfp-native-session") ?? "";
  if (cookie.length > 4096 || !/^(?:__Secure-)?better-auth\.session_token=(?:[A-Za-z0-9._~-]|%[A-Fa-f0-9]{2}){16,4096}$/.test(cookie)) throw new D1ApiError(401, "sign_in_required");
  let response: Response;
  try {
    const transport = env.NATIVE_AUTH_SERVICE ? env.NATIVE_AUTH_SERVICE.fetch.bind(env.NATIVE_AUTH_SERVICE) : fetcher;
    response = await transport(ORIGIN + "/api/auth/get-session", {
      headers: {cookie, "x-pmrfp-auth-preview-key": env.NATIVE_AUTH_GATEWAY_SECRET},
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000),
    });
  } catch { throw new D1ApiError(503, "native_auth_service_unavailable"); }
  if (response.status === 401 || response.status === 403) throw new D1ApiError(401, "sign_in_required");
  if (!response.ok) throw new D1ApiError(503, "native_auth_service_unavailable");
  let body: unknown;
  try { body = await response.json(); } catch { throw new D1ApiError(503, "native_auth_response_invalid"); }
  if (!record(body) || !record(body.user) || !record(body.session)) throw new D1ApiError(401, "sign_in_required");
  const {user, session} = body;
  if (typeof user.id !== "string" || !UUID.test(user.id) || !user.id.startsWith("00000000-0000-4000-8000-0000000000")
    || typeof user.email !== "string" || !user.email.endsWith("@example.invalid") || user.emailVerified !== true
    || session.userId !== user.id || typeof session.expiresAt !== "string" || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()
    || (user.banned !== false && !(user.banned === true && typeof user.banExpires === "string" && Number.isFinite(Date.parse(user.banExpires)) && Date.parse(user.banExpires) <= Date.now()))) throw new D1ApiError(401, "sign_in_required");
  return { id: user.id, email: user.email };
}

export async function verifyNativeSyntheticUser(request: Request, env: NativeSyntheticAuthConfig, fetcher: typeof fetch): Promise<string> {
  return (await verifyNativeSyntheticIdentity(request, env, fetcher)).id;
}
