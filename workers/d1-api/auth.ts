import { D1ApiError, UUID } from "../../src/lib/d1/contracts";

export interface AuthConfig { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }
/** The Auth server checks the access token and current user; JWT claims alone are never trusted. */
export async function verifyUser(request: Request, env: AuthConfig, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<string> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer +([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  if (!match || match[1].length > 4096) throw new D1ApiError(401, "sign_in_required");
  let base: URL;
  try { base = new URL(env.SUPABASE_URL); } catch { throw new D1ApiError(503, "auth_configuration_unavailable"); }
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash || !env.SUPABASE_ANON_KEY) throw new D1ApiError(503, "auth_configuration_unavailable");
  let response: Response;
  try {
    response = await fetcher(new URL("/auth/v1/user", base), {
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${match[1]}` },
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    // Coarse runtime diagnostics only: never expose messages, URLs, tokens or response bodies.
    const message = error instanceof Error ? error.message : "";
    const category = /illegal invocation/i.test(message) ? "context"
      : /not implemented|not a function/i.test(message) ? "runtime"
      : /cache/i.test(message) ? "cache"
      : /abort|timeout/i.test(message) ? "timeout"
      : /ssl|tls|certificate/i.test(message) ? "tls" : "network";
    throw new D1ApiError(503, `auth_transport_${category}`);
  }
  if (response.status === 401 || response.status === 403) throw new D1ApiError(401, "sign_in_required");
  if (!response.ok) throw new D1ApiError(503, "auth_service_unavailable");
  let user: { id?: unknown; is_anonymous?: unknown };
  try { user = await response.json() as typeof user; } catch { throw new D1ApiError(503, "auth_response_invalid"); }
  if (!user || typeof user.id !== "string" || !UUID.test(user.id) || user.is_anonymous === true) throw new D1ApiError(401, "sign_in_required");
  return user.id;
}
/** Hash both sides so the comparison has a fixed length, including unequal input lengths. */
export async function verifyGateway(provided: string | null, secret: string | undefined): Promise<void> {
  if (!secret || secret.length < 32) throw new D1ApiError(503, "gateway_unavailable");
  if (!provided || provided.length > 512) throw new D1ApiError(401, "unauthorized_gateway");
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([provided, secret].map(s => crypto.subtle.digest("SHA-256", encode.encode(s))));
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < aa.length; i++) mismatch |= aa[i] ^ bb[i];
  if (mismatch) throw new D1ApiError(401, "unauthorized_gateway");
}
