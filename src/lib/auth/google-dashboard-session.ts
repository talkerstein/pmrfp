import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { loadSessionContext } from "@/lib/access/access";
import { UUID } from "@/lib/d1/contracts";
import { createClient as createDashboardClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { googleDashboardBridgeEnabled } from "./vps-google";

/** Call solely after verified Google OIDC proves control of this Gmail or Workspace mailbox. */
export async function openExistingDashboardSession(email: string) {
  if (!googleDashboardBridgeEnabled() || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(email)) return null;
  const admin = createServiceClient();
  const profile = await admin.from("users_profile").select("id,status,primary_role").eq("email", email)
    .maybeSingle<{ id: string; status: string; primary_role: string }>();
  if (profile.error || !profile.data || !UUID.test(profile.data.id) || profile.data.status !== "active" ||
      ["admin", "super_admin"].includes(profile.data.primary_role)) return null;

  const expected = profile.data.id;
  const [owner, mfa] = await Promise.all([admin.auth.admin.getUserById(expected), admin.auth.admin.mfa.listFactors({ userId: expected })]);
  const user = owner.data.user;
  const flags = user as (typeof user & { banned_until?: string; is_sso_user?: boolean }) | null;
  if (owner.error || !user || user.id !== expected || user.email?.toLowerCase() !== email || !user.email_confirmed_at || user.is_anonymous ||
      flags?.is_sso_user || (flags?.banned_until && Date.parse(flags.banned_until) > Date.now()) ||
      mfa.error || !Array.isArray(mfa.data?.factors) || mfa.data.factors.some(factor => factor.status === "verified")) return null;

  // Generate a one-use exchange on the server. No email or link reaches the browser.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || link.data.user?.id !== expected || !link.data.properties?.hashed_token) return null;
  const exchange = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const redeemed = await exchange.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  const credentials = redeemed.data.session;
  if (redeemed.error || redeemed.data.user?.id !== expected || !credentials) return null;

  const context = await loadSessionContext(exchange);
  if (!context || context.userId !== expected || context.profile.status !== "active" ||
      ["admin", "super_admin"].includes(context.profile.primary_role)) {
    await exchange.auth.signOut({ scope: "local" });
    return null;
  }
  const browser = await createDashboardClient();
  const result = await browser.auth.setSession({ access_token: credentials.access_token, refresh_token: credentials.refresh_token });
  if (result.error || result.data.user?.id !== expected) {
    await exchange.auth.signOut({ scope: "local" });
    return null;
  }
  return context;
}
