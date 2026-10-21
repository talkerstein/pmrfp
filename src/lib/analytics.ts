/**
 * Server-side event tracking.
 *
 * Every funnel event is recorded FIRST-PARTY in our own database
 * (site_events, lib/tracking/server): that's what /admin/analytics and the
 * weekly email read, and it works on any Vercel plan. The same call also
 * sends a Vercel Analytics custom event, which shows up in Vercel only when
 * Web Analytics is switched on for the project (custom events need a paid
 * plan); nothing depends on it.
 *
 * Never throws: analytics is fire-and-forget.
 */
import { track } from "@vercel/analytics/server";
import type { SiteEvent } from "@/lib/tracking/events";
import { recordSiteEvent, type TrackContext } from "@/lib/tracking/server";

export const EVENT = {
  SIGNUP_COMPLETED: "signup_completed",
  SIGNIN_COMPLETED: "signin_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",
  CHECKOUT_STARTED: "checkout_started",
  CHECKOUT_COMPLETED: "checkout_completed",
  SUBSCRIPTION_ACTIVE: "subscription_active",
  TEMPLATE_USED: "template_used",
  RFP_POSTED: "rfp_posted",
  RFP_INTEREST_SUBMITTED: "rfp_interest_submitted",
  WRITER_DRAFT_GENERATED: "writer_draft_generated",
  TRIAL_STARTED: "trial_started",
  FOLLOW_BUYER: "follow_buyer",
  CLAIM_STARTED: "claim_started",
  CLAIM_VERIFIED: "claim_verified",
  QUOTE_REQUEST_POSTED: "quote_request_posted",
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];

type AllowedValue = string | number | boolean | null;

/** The first-party event each name is recorded as (names not listed go to Vercel only). */
const SITE_EVENT_FOR: Partial<Record<EventName, SiteEvent>> = {
  signup_completed: "signup_completed",
  onboarding_completed: "onboarding_completed",
  checkout_started: "checkout_started",
  checkout_completed: "checkout_completed",
  rfp_posted: "rfp_posted",
  // Expressing interest in a listing is how a company responds to a job.
  rfp_interest_submitted: "respond_to_job",
  writer_draft_generated: "writer_draft_generated",
  trial_started: "trial_started",
  follow_buyer: "follow_buyer",
  claim_started: "claim_started",
  claim_verified: "claim_verified",
  quote_request_posted: "quote_request_posted",
};

/**
 * Fire an analytics event. Properties must be primitive (string / number /
 * bool / null). `ctx` adds what the first-party record should know about
 * who and where (user id, role, country...); see lib/tracking/server.
 */
export async function trackEvent(
  name: EventName,
  properties?: Record<string, AllowedValue>,
  ctx: TrackContext = {},
): Promise<void> {
  const props = properties ?? {};
  try {
    await track(name, props);
  } catch {
    // Swallow — never let analytics break a user-facing action.
  }
  const site = SITE_EVENT_FOR[name];
  if (!site) return;
  const role = ctx.role ?? (typeof props.role === "string" ? props.role : null);
  const { role: _role, ...rest } = props;
  void _role;
  await recordSiteEvent(site, rest, { ...ctx, role });
}
