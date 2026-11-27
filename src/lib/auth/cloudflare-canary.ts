const workerOrigin = "https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev";
const workerCookie = "__Secure-better-auth.session_token";
const fixtureEmail = "migration-11@example.invalid";
const fixtureId = "00000000-0000-4000-8000-000000000011";
const tokenPattern = /^(?:[A-Za-z0-9._~-]|%[a-fA-F0-9]{2}){16,4096}$/;

export const canaryPath = "/api/auth/cloudflare-canary";
export const canaryCookie = "__Secure-pmrfp-cloudflare-canary";
export const canaryCookieOptions = { path: canaryPath, httpOnly: true, secure: true, sameSite: "strict" as const };

export function cloudflareCanaryConfig(env: Record<string, string | undefined> = process.env, now = Date.now()) {
  const key = env.PMRFP_CLOUDFLARE_LOGIN_CANARY_KEY;
  const until = Date.parse(env.PMRFP_CLOUDFLARE_LOGIN_CANARY_UNTIL ?? "");
  if (env.VERCEL_ENV !== "production" || !key || !/^[a-f0-9]{64}$/.test(key) ||
    !Number.isFinite(until) || until <= now || until - now > 2 * 60 * 60 * 1000) return null;
  return { key, until };
}

type Config = NonNullable<ReturnType<typeof cloudflareCanaryConfig>>;
type Credentials = { email: string; password: string };

export function isCloudflareCanaryEmail(email: string) {
  return email === fixtureEmail;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function fixtureUser(value: unknown): boolean {
  return record(value) && record(value.user) && value.user.id === fixtureId &&
    value.user.email === fixtureEmail && value.user.emailVerified === true && value.user.banned === false;
}

async function workerRequest(
  config: Config, operation: "sign-in/email" | "get-session" | "sign-out", fetcher: typeof fetch,
  token?: string, body?: Credentials | Record<string, never>,
) {
  return fetcher(workerOrigin + "/api/auth/" + operation, {
    method: body ? "POST" : "GET",
    headers: {
      "x-pmrfp-auth-preview-key": config.key,
      ...(body ? { "content-type": "application/json", origin: workerOrigin } : {}),
      ...(token ? { cookie: workerCookie + "=" + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
}

export async function cloudflareCanarySignIn(config: Config, credentials: Credentials, fetcher = fetch) {
  if (!isCloudflareCanaryEmail(credentials.email) || Buffer.byteLength(credentials.password) > 72) return null;
  try {
    const upstream = await workerRequest(config, "sign-in/email", fetcher, undefined, credentials);
    if (!upstream.ok || !fixtureUser(await upstream.json())) return null;
    const cookies = upstream.headers.getSetCookie().filter(value => value.startsWith(workerCookie + "="));
    const token = cookies.length === 1 ? cookies[0].split(";")[0].slice(workerCookie.length + 1) : "";
    return tokenPattern.test(token) ? token : null;
  } catch {
    return null;
  }
}

export async function cloudflareCanarySession(config: Config, token: string, fetcher = fetch) {
  if (!tokenPattern.test(token)) return false;
  try {
    const response = await workerRequest(config, "get-session", fetcher, token);
    if (!response.ok) return false;
    const value: unknown = await response.json();
    return record(value) && fixtureUser(value) && record(value.session) && value.session.userId === fixtureId &&
      typeof value.session.expiresAt === "string" && Date.parse(value.session.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

export async function cloudflareCanarySignOut(config: Config, token: string, fetcher = fetch) {
  if (!tokenPattern.test(token)) return false;
  try {
    const response = await workerRequest(config, "sign-out", fetcher, token, {});
    return response.ok;
  } catch {
    return false;
  }
}
