import { after, NextRequest, NextResponse } from "next/server";
import { checkStagingRateLimit, stagingClientIp } from "@/lib/d1/staging-rate-limit";
import { finishGoogleSignIn, googleOrigin, googleStateCookie, googleStateOptions, nativeGoogleConfigured, readGoogleState } from "@/lib/auth/vps-google";
import { establishVpsGoogleSession } from "@/lib/d1/customer-staging-session";
import { roleHome } from "@/lib/access/access";
import { DEFAULT_LOCALE, localizePath } from "@/i18n/config";
import { postOAuthRedirect } from "@/lib/auth/oauth";
import { FRESH_SIGNUP_MS, recordSignupAttribution } from "@/lib/attribution/record";

export async function GET(request: NextRequest) {
  if (!nativeGoogleConfigured()) return new Response(null, { status: 404 });
  const params = request.nextUrl.searchParams;
  const state = readGoogleState(request.cookies.get(googleStateCookie)?.value, params.get("state"));
  const lang = state?.lang ?? DEFAULT_LOCALE;
  const respond = (path: string) => {
    const result = NextResponse.redirect(new URL(path.startsWith("/api/") ? path : localizePath(path, lang), googleOrigin), {
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });
    result.cookies.set(googleStateCookie, "", { ...googleStateOptions, maxAge: 0 });
    return result;
  };
  const failure = "/sign-in?error=google";
  const code = params.get("code");
  if (!state || !code || code.length > 1024 || params.has("error") ||
      params.getAll("state").length !== 1 || params.getAll("code").length !== 1) return respond(failure);
  const limit = await checkStagingRateLimit("auth-ip", stagingClientIp(request.headers, true), true);
  if (limit.status !== 204) return respond(failure);

  try {
    const identity = await finishGoogleSignIn(code, state);
    const session = identity?.nativeEmail
      ? await establishVpsGoogleSession(identity.nativeEmail)
      : identity?.dashboardEmail
        ? await (await import("@/lib/auth/google-dashboard-session")).openExistingDashboardSession(identity.dashboardEmail)
        : null;
    if (!session) return respond(failure);
    if (process.env.PMRFP_GOOGLE_OAUTH_REHEARSAL_EMAIL) return respond("/api/auth/google/check");
    const age = Date.now() - Date.parse(session.profile.created_at);
    if (identity?.nativeEmail && state.signup && age >= 0 && age <= FRESH_SIGNUP_MS) after(() => recordSignupAttribution({
      userId: session.userId, orgId: session.organization?.id, role: null,
      method: "google", lang, signedUpAt: session.profile.created_at,
    }));
    return respond(postOAuthRedirect(state.next, {
      home: roleHome(session.profile.primary_role),
      onboardingCompleted: session.profile.onboarding_completed,
    }));
  } catch {
    // The token exchange error may contain provider credentials or the code.
    return respond(failure);
  }
}
