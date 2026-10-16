import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import type { TrackedStep } from "./steps";

/**
 * Record that a user reached an onboarding step (onboarding_steps, migration
 * 20261017000060). First time wins: a repeat keeps the original first_at and
 * refreshes last_at / detail. Service role (users can't write the table).
 * Never throws and never blocks onboarding: a missing table or an error is
 * logged and ignored. Call it inside after() where possible.
 */
export async function recordOnboardingStep(userId: string | null | undefined, step: TrackedStep, detail: string | null = null): Promise<void> {
  if (!userId || !isServiceConfigured()) return;
  try {
    const { error } = await createServiceClient()
      .from("onboarding_steps")
      .upsert({ user_id: userId, step, last_at: new Date().toISOString(), detail: detail?.slice(0, 80) ?? null }, { onConflict: "user_id,step" });
    if (error) console.warn("[onboarding-steps]", error.message);
  } catch (err) {
    console.warn("[onboarding-steps]", err instanceof Error ? err.message : err);
  }
}
