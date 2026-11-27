import { getCustomerStagingSession } from "@/lib/d1/customer-staging-session";
import { nativeGoogleConfigured } from "@/lib/auth/vps-google";

export async function GET() {
  const email = process.env.PMRFP_GOOGLE_OAUTH_REHEARSAL_EMAIL;
  if (!nativeGoogleConfigured() || !email) return new Response(null, { status: 404 });
  const session = await getCustomerStagingSession();
  if (session?.profile.email !== email) return new Response(null, { status: 401 });
  return new Response("Google sign-in opened the existing PMRFP profile.", {
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
  });
}
