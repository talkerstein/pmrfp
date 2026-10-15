import "server-only";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { FT_COOKIE, parseFirstTouch } from "./cookie";
import { signupAttributionRow, type SignupMethod } from "./signup";

/**
 * Saves where a new account came from (signup_attribution), once per user:
 *  - at sign-up (email form, or the role pick after Google) with no org yet;
 *  - at onboarding completion, which adds the organization and fills the row
 *    in if sign-up didn't write one (an older tab, a failed write).
 * The first write wins: later calls never change the first-touch fields,
 * they only attach the org. Reads the pmrfp_ft cookie of THIS request, so it
 * is called from server actions only. Never throws, never blocks sign-up.
 */
export async function recordSignupAttribution(i: { userId: string; orgId?: string | null; method?: SignupMethod | null }): Promise<void> {
  if (!i.userId || !isServiceConfigured()) return;
  try {
    const [jar, h] = await Promise.all([cookies(), headers()]);
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];
    const row = signupAttributionRow({
      userId: i.userId,
      orgId: i.orgId ?? null,
      ft: parseFirstTouch(jar.get(FT_COOKIE)?.value),
      method: i.method ?? null,
      ownHosts: host ? [host] : [],
    });
    const admin = createServiceClient();
    const { error } = await admin.from("signup_attribution").upsert(row, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) {
      console.warn("[attribution] save failed:", error.message);
      return;
    }
    if (i.orgId) {
      await admin.from("signup_attribution").update({ org_id: i.orgId }).eq("user_id", i.userId).is("org_id", null);
    }
  } catch (e) {
    console.warn("[attribution] save failed:", e instanceof Error ? e.message : e);
  }
}
