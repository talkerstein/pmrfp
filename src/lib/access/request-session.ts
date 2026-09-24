import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadSessionContext, type SessionContext } from "./access";

/**
 * Session for Route Handlers that the mobile app calls as well as the web.
 *
 * The web sends the usual cookies. The app has no cookies: it sends
 * `Authorization: Bearer <supabase access token>`, which Supabase Auth
 * verifies (getUser(token)) before anything is read. Either way the caller
 * gets the same SessionContext getSession() builds, plus an RLS-bound client
 * acting as that user for any follow-up reads.
 *
 * getSession() itself is untouched; only routes that opt in use this.
 */

export interface RequestSession {
  session: SessionContext;
  /** Anon-key client signed in as this user. RLS applies. */
  db: SupabaseClient;
  via: "cookie" | "bearer";
}

export type BearerHeader =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "token"; token: string };

/** A Supabase access token is a JWT: three base64url segments. */
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** Real tokens are ~1 KB. Anything far bigger never reaches the auth server. */
export const MAX_BEARER_LENGTH = 4096;

/**
 * Read an Authorization header. "none" when it's absent or blank; "invalid"
 * for any other scheme or a token that isn't JWT-shaped.
 */
export function parseBearerHeader(header: string | null | undefined): BearerHeader {
  const value = header?.trim() ?? "";
  if (!value) return { kind: "none" };
  const m = /^bearer +(\S+)$/i.exec(value);
  if (!m) return { kind: "invalid" };
  const token = m[1];
  if (token.length > MAX_BEARER_LENGTH || !JWT_RE.test(token)) return { kind: "invalid" };
  return { kind: "token", token };
}

export interface RequestSessionDeps {
  configured: () => boolean;
  cookieClient: () => Promise<SupabaseClient>;
  bearerClient: (token: string) => SupabaseClient;
  load: (db: SupabaseClient, accessToken?: string) => Promise<SessionContext | null>;
}

/** Anon-key client that sends the caller's token to PostgREST, so RLS sees them. */
function bearerClient(token: string): SupabaseClient {
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const defaultDeps: RequestSessionDeps = {
  configured: isSupabaseConfigured,
  cookieClient: createCookieClient,
  bearerClient,
  load: loadSessionContext,
};

/**
 * The caller's session from a bearer token when the request carries an
 * Authorization header, otherwise from the cookie session. A header that is
 * present but malformed, expired or revoked gets null (a 401), never a
 * silent fall back to cookies.
 */
export async function getSessionFromRequest(
  request: Request,
  deps: RequestSessionDeps = defaultDeps,
): Promise<RequestSession | null> {
  if (!deps.configured()) return null;
  const bearer = parseBearerHeader(request.headers.get("authorization"));
  if (bearer.kind === "invalid") return null;

  if (bearer.kind === "token") {
    const db = deps.bearerClient(bearer.token);
    const session = await deps.load(db, bearer.token);
    return session ? { session, db, via: "bearer" } : null;
  }

  const db = await deps.cookieClient();
  const session = await deps.load(db);
  return session ? { session, db, via: "cookie" } : null;
}
