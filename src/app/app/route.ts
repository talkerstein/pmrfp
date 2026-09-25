import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/access/access";
import { appStartPath } from "@/lib/pwa/start";

/**
 * The installed app's start_url (/app?source=pwa). Sends each person to their
 * own home: trades to /dashboard, PMs and realtors to /pm-dashboard, admins
 * to /admin, signed-out visitors to sign-in (then back here). Route handlers
 * aren't cached by default, and this one reads cookies, so it runs per request;
 * no-store keeps any CDN or browser cache from replaying one person's redirect.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const to = appStartPath(
    session
      ? {
          primaryRole: session.profile.primary_role,
          status: session.profile.status,
          onboardingCompleted: session.profile.onboarding_completed,
        }
      : null,
  );
  const response = NextResponse.redirect(new URL(to, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
