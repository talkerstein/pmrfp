import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession, roleHome } from "@/lib/access/access";
import { postOAuthRedirect } from "@/lib/auth/oauth";
import { safeNextPath } from "@/lib/auth/next";
import { EVENT, trackEvent } from "@/lib/analytics";

/**
 * Google sends people back here with a one-time `code` (PKCE). Swap it for a
 * session cookie, then continue like an email sign-in would. No code, or a
 * failed swap (cancelled, expired, started on another domain), goes back to
 * /sign-in with a friendly message.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const failed = NextResponse.redirect(new URL("/sign-in?error=google", request.url));
  if (!code || !isSupabaseConfigured()) return failed;

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback]", error.message);
    return failed;
  }

  const session = await getSession();
  await trackEvent(EVENT.SIGNIN_COMPLETED, { method: "google", hasNext: !!safeNextPath(next) });
  const to = postOAuthRedirect(
    next,
    session
      ? { onboardingCompleted: session.profile.onboarding_completed, home: roleHome(session.profile.primary_role) }
      : null,
  );
  return NextResponse.redirect(new URL(to, request.url));
}
