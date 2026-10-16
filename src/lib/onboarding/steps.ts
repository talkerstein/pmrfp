/**
 * Where a sign-up got to in onboarding. Pure (unit-tested).
 *
 * Onboarding is short: sign up → confirm the email → (Google sign-ups only)
 * "what describes you" → the company form → done. The app records the steps
 * it can see in onboarding_steps (lib/onboarding/progress, one row per user
 * per step, first time only); the account and the email confirmation come
 * from users_profile / auth. The furthest step reached is where they stalled.
 */

/** Recorded by the app (onboarding_steps.step). */
export const TRACKED_STEPS = ["role_pick_viewed", "role_picked", "form_viewed", "form_error", "org_failed"] as const;
export type TrackedStep = (typeof TRACKED_STEPS)[number];

export function isTrackedStep(v: unknown): v is TrackedStep {
  return typeof v === "string" && (TRACKED_STEPS as readonly string[]).includes(v);
}

/** Every stage, in funnel order. */
export const STAGES = [
  "signed_up",
  "email_confirmed",
  "role_pick_viewed",
  "role_picked",
  "form_viewed",
  "form_error",
  "org_failed",
  "completed_no_company",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  signed_up: "Created account, never confirmed the email",
  email_confirmed: "Confirmed email, never opened onboarding (or before tracking)",
  role_pick_viewed: "Saw \"what describes you\" (Google sign-up), didn't pick",
  role_picked: "Picked a role, never opened the company form",
  form_viewed: "Opened the company form, never submitted",
  form_error: "Submitted the company form, it was rejected",
  org_failed: "Submitted the company form, saving failed (our side)",
  completed_no_company: "Marked complete but no company linked",
};

/** The furthest stage reached. */
export function stageOf(p: {
  emailConfirmed: boolean;
  steps: ReadonlySet<string>;
  onboardingCompleted: boolean;
  hasCompany: boolean;
}): Stage {
  if (p.onboardingCompleted && !p.hasCompany) return "completed_no_company";
  for (const s of ["org_failed", "form_error", "form_viewed", "role_picked", "role_pick_viewed"] as const) {
    if (p.steps.has(s)) return s;
  }
  // Seeing a tracked step proves the email was confirmed.
  return p.emailConfirmed ? "email_confirmed" : "signed_up";
}

/** Count of stalled sign-ups per stage, in funnel order (only stages with someone in them). */
export function stallCounts(stages: readonly Stage[]): { stage: Stage; count: number }[] {
  return STAGES.map((stage) => ({ stage, count: stages.filter((s) => s === stage).length })).filter((r) => r.count > 0);
}

/** Short, non-personal detail for a form_error row: the first failing field. */
export function errorDetail(issuePath: readonly (string | number | symbol)[] | undefined): string | null {
  const f = issuePath?.[0];
  return typeof f === "string" && /^[a-zA-Z_]{1,40}$/.test(f) ? f : null;
}
