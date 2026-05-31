/**
 * Server-side event tracking via Vercel Analytics.
 *
 * Client-side page views are already tracked automatically by the <Analytics />
 * component in app/layout.tsx. This module is for firing CUSTOM events from
 * server actions and route handlers (signup, checkout, template-use, etc.).
 *
 * Fails silently in environments where Vercel Analytics isn't available (e.g.
 * local dev without `vercel dev`). Never throw — analytics is fire-and-forget.
 */
import { track } from "@vercel/analytics/server";

export const EVENT = {
  SIGNUP_COMPLETED: "signup_completed",
  SIGNIN_COMPLETED: "signin_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",
  CHECKOUT_STARTED: "checkout_started",
  SUBSCRIPTION_ACTIVE: "subscription_active",
  TEMPLATE_USED: "template_used",
  RFP_POSTED: "rfp_posted",
  RFP_INTEREST_SUBMITTED: "rfp_interest_submitted",
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];

type AllowedValue = string | number | boolean | null;

/**
 * Fire an analytics event. Properties must be primitive (string / number / bool / null)
 * — Vercel's tracker rejects nested objects.
 */
export async function trackEvent(
  name: EventName,
  properties?: Record<string, AllowedValue>,
): Promise<void> {
  try {
    await track(name, properties ?? {});
  } catch {
    // Swallow — never let analytics break a user-facing action.
  }
}
