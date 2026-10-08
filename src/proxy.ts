import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { GEO_COOKIE, encodeGeo } from "@/lib/visitor-geo";
import { checkPublicReadLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isPublicPageRead } from "@/lib/public-read-policy";
import { DEFAULT_LOCALE, ENABLED_LOCALES, LOCALE_COOKIE, hasLocale, isEnabledLocale, splitLocale, type Locale } from "@/i18n/config";

// Next.js 16 "proxy" convention (formerly middleware). Refreshes the Supabase
// session on each request, and routes languages:
//   /rfps      -> rewritten to /en/rfps (English keeps its URLs)
//   /fr/rfps   -> served as is (app/[lang])
//   /en/rfps   -> redirected to /rfps
// A visitor who picked French (cookie) or whose browser prefers it is sent to
// the /fr version of unprefixed links, so untranslated hrefs and server
// redirects keep their language.

// Routes outside app/[lang], and public files.
const PASSTHROUGH = /^\/(api|embed|auth\/callback|go|app|_next)(\/|$)/;
const PUBLIC_FILE = /\.(?:js|mjs|css|map|json|txt|xml|webmanifest|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf)$/i;
// File-based metadata routes (/en/opengraph-image...) are requested by their internal URL.
const METADATA_ROUTE = /\/(opengraph-image|twitter-image|icon|apple-icon)(?:[-/]|$)/;
const MONTHLY_REPORT_CSV = /^(?:\/(?:en|fr|es))?\/reports\/contract-winners\/(\d{4}-(?:0[1-9]|1[0-2]))\.csv$/;
const BOT =/bot|crawl|spider|slurp|facebookexternalhit|whatsapp|embedly|preview|lighthouse|headless/i;
const COOKIE_OPTS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };

function withGeo(request: NextRequest, response: NextResponse) {
  // Copy Vercel's IP geolocation into a readable cookie so cached pages can
  // show U.S. visitors U.S. tenders and prices (see lib/visitor-geo).
  const geo = encodeGeo(request.headers.get("x-vercel-ip-country"), request.headers.get("x-vercel-ip-country-region"));
  if (geo && request.cookies.get(GEO_COOKIE)?.value !== geo) {
    response.cookies.set(GEO_COOKIE, geo, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  }
  return response;
}

/** The browser's first-choice language, if we serve it. */
function browserLocale(acceptLanguage: string | null): Locale | null {
  const first = acceptLanguage?.split(",")[0]?.trim().split(/[-;]/)[0]?.toLowerCase();
  return isEnabledLocale(first) ? first : null;
}

function isPageNavigation(request: NextRequest) {
  return request.headers.get("sec-fetch-dest") === "document" && !request.headers.get("rsc");
}

function redirectTo(request: NextRequest, pathname: string, status: 307 | 308 = 307) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url, status);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isGet = request.method === "GET" || request.method === "HEAD";

  if (isPublicPageRead(request.method, pathname)) {
    const blocked = await checkPublicReadLimit(request);
    if (blocked) return rateLimitResponse(blocked);
  }

  // A monthly report's CSV (/reports/contract-winners/2026-09.csv, any language
  // prefix) can't share the [month] page segment, so it's served by an API route.
  const reportCsv = pathname.match(MONTHLY_REPORT_CSV);
  if (reportCsv) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/reports/contract-winners/${reportCsv[1]}`;
    return NextResponse.rewrite(url);
  }

  if (PASSTHROUGH.test(pathname) || PUBLIC_FILE.test(pathname)) {
    return withGeo(request, await updateSession(request));
  }

  const first = pathname.split("/")[1];

  if (hasLocale(first)) {
    const { path } = splitLocale(pathname);
    // English has no prefix; a language that isn't open yet falls back to English.
    if (isGet && !METADATA_ROUTE.test(pathname) && (first === DEFAULT_LOCALE || !isEnabledLocale(first))) {
      const res = redirectTo(request, path, first === DEFAULT_LOCALE ? 308 : 307);
      if (first === DEFAULT_LOCALE) res.cookies.set(LOCALE_COOKIE, DEFAULT_LOCALE, COOKIE_OPTS);
      return res;
    }
    return withGeo(request, await updateSession(request, { lang: first, path }));
  }

  // Unprefixed: English, unless the visitor chose another language or their browser asks for one.
  if (isGet) {
    const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
    let target: Locale | null = isEnabledLocale(chosen) && chosen !== DEFAULT_LOCALE ? chosen : null;
    const detected = !chosen && isPageNavigation(request) && !BOT.test(request.headers.get("user-agent") ?? "")
      ? browserLocale(request.headers.get("accept-language"))
      : null;
    if (!target && detected && detected !== DEFAULT_LOCALE && ENABLED_LOCALES.includes(detected)) target = detected;
    if (target) {
      const res = redirectTo(request, `/${target}${pathname === "/" ? "" : pathname}`);
      if (!chosen) res.cookies.set(LOCALE_COOKIE, target, COOKIE_OPTS);
      return res;
    }
  }

  const rewrite = request.nextUrl.clone();
  rewrite.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return withGeo(request, await updateSession(request, { lang: DEFAULT_LOCALE, path: pathname, rewrite }));
}

export const config = {
  matcher: [
    // Website widgets (/embed/*, /embed.js) and the service worker skip the
    // session refresh: they're public, framed by other sites, and must stay cacheable.
    "/((?!_next/static|_next/image|embed/|embed\.js|sw\.js|manifest\.webmanifest|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
