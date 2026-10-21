import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession, roleHome } from "@/lib/access/access";
import { postOAuthRedirect } from "@/lib/auth/oauth";
import { callbackFailurePath } from "@/lib/auth/magic-link";
import { safeNextPath } from "@/lib/auth/next";
import { EVENT, trackEvent } from "@/lib/analytics";
import { FRESH_OAUTH_MS, blockDuplicateOAuthUser, existingAccountPath } from "@/lib/dedupe/signup";
import { recordSignupAttribution } from "@/lib/attribution/record";

/** An account this new (and not yet onboarded) gets its sign-up source recorded at the callback. */
const ATTRIBUTION_WINDOW_MS = 7 * 86_400_000;

/**
 * Google sends people back here with a one-time `code` (PKCE). Swap it for a
 * session cookie, then continue like an email sign-in would. No code, or a
 * failed swap (cancelled, expired, started on another domain), goes back to
 * /sign-in with a friendly message.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  // Google and emailed sign-in links (m=link, lib/auth/magic-link) both land here.
  const method = request.nextUrl.searchParams.get("m");
  const failed = NextResponse.redirect(new URL(callbackFailurePath(method), request.url));
  if (!code || !isSupabaseConfigured()) return failed;

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback]", error.message);
    return failed;
  }

  // One account per mailbox: a brand-new Google account for an address that
  // already has a PMRFP account (a Gmail dot / +tag variant) is undone and
  // sent to sign in. Never says which method the existing account uses.
  const { data: fresh } = await supabase.auth.getUser();
  if (fresh.user && method !== "link" && Date.now() - Date.parse(fresh.user.created_at) < FRESH_OAUTH_MS) {
    const blocked = await blockDuplicateOAuthUser(fresh.user.id, { beforeRemove: () => supabase.auth.signOut() });
    if (blocked) return NextResponse.redirect(new URL(existingAccountPath(safeNextPath(next)), request.url));
  }

  const session = await getSession();
  // A brand-new account (Google, or an emailed sign-up link): save where it
  // came from now, while this browser's first-touch cookie is here. The
  // first write wins, so a link sign-up already recorded at the form keeps
  // its row; Google's role is added when they pick it.
  if (fresh.user && session && !session.profile.onboarding_completed && Date.now() - Date.parse(fresh.user.created_at) < ATTRIBUTION_WINDOW_MS) {
    await recordSignupAttribution({
      userId: fresh.user.id,
      method: method === "link" ? "magic_link" : "google",
      role: method === "link" ? session.profile.primary_role : null,
      signedUpAt: fresh.user.created_at,
    });
  }
  await trackEvent(EVENT.SIGNIN_COMPLETED, { method: method === "link" ? "link" : "google", hasNext: !!safeNextPath(next) });
  const to = postOAuthRedirect(
    next,
    session
      ? { onboardingCompleted: session.profile.onboarding_completed, home: roleHome(session.profile.primary_role) }
      : null,
  );
  return NextResponse.redirect(new URL(to, request.url));
}
