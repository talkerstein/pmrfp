import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAuthReadFetch } from "./read-retry";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

/**
 * Refreshes the Supabase auth session on each request and (in Phase 3) will
 * enforce route protection for /dashboard, /pm-dashboard, /admin.
 *
 * Until Supabase env vars are configured, this is a graceful no-op so the
 * app runs locally and builds on Vercel without secrets.
 */
/**
 * `lang`/`path`: the request's language and its path without the prefix
 * (/fr/dashboard -> fr, /dashboard). `rewrite`: serve this internal URL instead
 * (unprefixed English pages rewrite to /en/...).
 */
export async function updateSession(
  request: NextRequest,
  opts: { lang?: Locale; path?: string; rewrite?: URL } = {},
) {
  const pass = () => (opts.rewrite ? NextResponse.rewrite(opts.rewrite, { request }) : NextResponse.next({ request }));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return pass();
  }

  const path = opts.path ?? request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/dashboard") || path.startsWith("/pm-dashboard") || path.startsWith("/admin");
  // Anonymous public requests (including crawlers) have no session to refresh.
  // Signed-in requests and protected routes retain the existing verification.
  const hasSessionCookie = request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
  if (!hasSessionCookie && !isProtected) return pass();

  let response = pass();

  const supabase = createServerClient(url, anonKey, {
    global: { fetch: createAuthReadFetch(url) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = pass();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh tokens + read the current user.
  const { data, error } = await supabase.auth.getUser();
  // A network/auth-service outage is not proof of an expired session. Keep
  // private routes closed and let the visitor retry instead of redirecting
  // to sign-in with a still-valid session.
  if (isProtected && error && (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500)) {
    return new NextResponse("Sign-in verification is temporarily unavailable. Please retry shortly.", {
      status: 503,
      headers: { "Retry-After": "5", "Cache-Control": "no-store" },
    });
  }

  // Protect authenticated areas. Page-level requireRole() enforces the
  // specific role; here we just bounce logged-out users to sign-in.
  if (isProtected && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = opts.lang && opts.lang !== DEFAULT_LOCALE ? `/${opts.lang}/sign-in` : "/sign-in";
    // Keep the query inside `next` (e.g. ?kind=gc&award=…) — it used to be
    // left on /sign-in, where nothing reads it.
    url.search = "";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  return response;
}
