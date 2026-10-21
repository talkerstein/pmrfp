import { FT_COOKIE, parseFirstTouch, torontoDay, type FirstTouch } from "@/lib/attribution/cookie";
import { countryCode } from "./events";
import { visitorHash } from "./hash";
import { userIdFromAuthCookies } from "./session-cookie";

/**
 * What one request tells first-party tracking, from its headers and
 * cookies only (no database, no Auth call): the Toronto day, the anonymous
 * visitor hash, the two-letter country the host estimated, the signed-in
 * user id from the session cookie (analytics only, unverified), our own
 * host, and the first-touch cookie. Never the IP address.
 */

interface HeaderBag {
  get(name: string): string | null | undefined;
}

export interface RequestFacts {
  day: string;
  hash: string;
  country: string | null;
  userId: string | null;
  host: string;
  ft: FirstTouch | null;
}

export function requestFacts(
  h: HeaderBag,
  cookies: readonly { name: string; value: string }[],
  opts: { userId?: string | null; now?: Date; secret?: string } = {},
): RequestFacts {
  const day = torontoDay(opts.now);
  const ftRaw = cookies.find((c) => c.name === FT_COOKIE)?.value ?? null;
  const userId = opts.userId ?? userIdFromAuthCookies(cookies, opts.now?.getTime());
  const country = countryCode(h.get("x-vercel-ip-country"));
  const region = String(h.get("x-vercel-ip-country-region") ?? "").slice(0, 10);
  const hash = visitorHash(
    {
      day,
      userId,
      browserKey: ftRaw,
      userAgent: h.get("user-agent") ?? "",
      acceptLanguage: h.get("accept-language") ?? "",
      geo: country ? `${country}-${region}` : "",
    },
    opts.secret,
  );
  const host = String(h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
  return { day, hash, country, userId, host, ft: parseFirstTouch(ftRaw) };
}

/** Cookies from a raw Cookie header (route handlers that only have a Request). */
export function parseCookieHeader(header: string | null | undefined): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const part of String(header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    let value = part.slice(i + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    if (name) out.push({ name, value });
  }
  return out.slice(0, 100);
}
