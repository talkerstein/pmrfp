/**
 * The signed-in user's id, read straight from the Supabase auth cookie
 * (sb-<project>-auth-token, possibly split into .0/.1 chunks, possibly
 * "base64-" encoded) WITHOUT a network call. Pure and unit-tested.
 *
 * Analytics only: the token's signature is not checked, so this must never
 * gate access to anything. It lets the beacon tie a listing view or a click
 * to an account (for reach reports and the funnel) without adding an Auth
 * request to every page view. A forged cookie can only mislabel its own
 * analytics rows; the database ignores ids that aren't real accounts.
 */

const AUTH_COOKIE = /^(sb-.+-auth-token)(?:\.(\d+))?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Real session cookies are a few KB; ignore anything absurd. */
const MAX_COOKIE = 16_384;

function decodeB64url(s: string): string | null {
  try {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function userIdFromAuthCookies(cookies: readonly { name: string; value: string }[], nowMs = Date.now()): string | null {
  const groups = new Map<string, { whole?: string; parts: Map<number, string> }>();
  for (const c of cookies) {
    const m = AUTH_COOKIE.exec(c.name);
    if (!m) continue;
    const g: { whole?: string; parts: Map<number, string> } = groups.get(m[1]) ?? { parts: new Map<number, string>() };
    if (m[2] === undefined) g.whole = c.value;
    else g.parts.set(Number(m[2]), c.value);
    groups.set(m[1], g);
  }
  for (const g of groups.values()) {
    let raw = g.whole ?? "";
    if (!raw && g.parts.size) {
      const chunks: string[] = [];
      for (let i = 0; g.parts.has(i); i++) chunks.push(g.parts.get(i)!);
      raw = chunks.join("");
    }
    if (!raw || raw.length > MAX_COOKIE) continue;
    let text: string | null = raw;
    try {
      text = decodeURIComponent(raw);
    } catch {
      /* keep raw */
    }
    if (text.startsWith("base64-")) text = decodeB64url(text.slice(7));
    if (!text) continue;
    let session: unknown;
    try {
      session = JSON.parse(text);
    } catch {
      continue;
    }
    // Older clients stored [access_token, refresh_token, …].
    const token = Array.isArray(session) ? session[0] : (session as { access_token?: unknown } | null)?.access_token;
    if (typeof token !== "string") continue;
    const payloadPart = token.split(".")[1];
    if (!payloadPart) continue;
    const payloadText = decodeB64url(payloadPart);
    if (!payloadText) continue;
    try {
      const payload = JSON.parse(payloadText) as { sub?: unknown; exp?: unknown };
      if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) continue;
      // A session expired more than a week ago is stale (the browser would have refreshed it).
      if (typeof payload.exp === "number" && payload.exp * 1000 < nowMs - 7 * 86_400_000) continue;
      return payload.sub.toLowerCase();
    } catch {
      continue;
    }
  }
  return null;
}
