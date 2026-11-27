import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import type { TrackedStep } from "./steps";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "@/lib/d1/contracts";

/**
 * Record that a user reached an onboarding step (onboarding_steps, migration
 * 20261017000060). First time wins: a repeat keeps the original first_at and
 * refreshes last_at / detail. Service role (users can't write the table).
 * Never throws and never blocks onboarding: a missing table or an error is
 * logged and ignored. Call it inside after() where possible.
 */
export async function recordOnboardingStep(userId: string | null | undefined, step: TrackedStep, detail: string | null = null): Promise<void> {
  const native = isVpsLiveCustomerAuth();
  if (!userId || (!native && !isServiceConfigured())) return;
  try {
    const now = new Date().toISOString();
    const text = detail?.slice(0, 80) ?? null;
    if (native) {
      await vpsAppDatabase().prepare(`INSERT INTO onboarding_steps(user_id,step,last_at,detail)
        SELECT u.id,?,?,? FROM users_profile u WHERE u.id=? AND u.status='active' AND ${customerAppAuthority}
        ON CONFLICT(user_id,step) DO UPDATE SET last_at=excluded.last_at,detail=excluded.detail
        WHERE onboarding_steps.last_at<=excluded.last_at`).bind(step, now, text, userId).run();
      return;
    }
    const { error } = await createServiceClient()
      .from("onboarding_steps")
      .upsert({ user_id: userId, step, last_at: now, detail: text }, { onConflict: "user_id,step" });
    if (error) console.warn("[onboarding-steps]", error.message);
  } catch (err) {
    console.warn("[onboarding-steps]", err instanceof Error ? err.message : err);
  }
}
