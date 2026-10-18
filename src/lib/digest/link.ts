import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

/**
 * A weekly-email / "email me bids like this" subscriber who later creates an
 * account: link the subscriber row to the account (same address), so the
 * light sign-up converts instead of living as a separate list. Called once
 * the account's email is confirmed (onboarding completes). Never throws.
 */
export async function linkDigestSubscriber(userId: string, email: string | null | undefined): Promise<void> {
  const key = (email ?? "").trim().toLowerCase();
  if (!key || !isServiceConfigured()) return;
  try {
    await createServiceClient()
      .from("digest_subscribers")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("email_key", key)
      .is("user_id", null);
  } catch (err) {
    console.error("[digest] link failed:", err instanceof Error ? err.message : err);
  }
}
