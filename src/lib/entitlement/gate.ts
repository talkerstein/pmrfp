import { safeNextPath } from "@/lib/auth/next";
import { splitLocale } from "@/i18n/config";
import { orgIsHeld, parseTrialSource, trialRefusal, type TrialSource, type TrialState } from "./trial";

/**
 * Trial-first Pro gates. Every locked teaser, "Unlock" and "Upgrade" button
 * asks this file what to offer instead of linking straight to paid billing:
 *
 *   trial         a signed-in company that can still start its free trial:
 *                 a one-click form ("Start 14-day free trial (no card)")
 *                 that returns to the same page, unlocked
 *   signup_trial  a signed-out visitor: sign-up for the trial, which resumes
 *                 after onboarding (/start-trial)
 *   resume        signed in but no company yet: onboarding first, then the
 *                 trial (/start-trial sends them there)
 *   paid          already used the trial, already paying, not a trade
 *                 company, held, or trials are off: the normal paid link
 *
 * Pure and unit-tested (test/unit/trial-first.test.ts). Prices never travel
 * in a URL; the plan names are re-validated by the checkout flow.
 */

export type GateMode = "trial" | "signup_trial" | "resume" | "paid";

export interface GateWho {
  signedIn: boolean;
  onboarded?: boolean;
  organizationType?: string | null;
  organizationStatus?: string | null;
  organizationProfileStatus?: string | null;
  riskFlagged?: boolean | null;
  paid?: boolean;
  trial?: TrialState;
  /** The trade_trials table is there (lib/entitlement/server trialsOpen). */
  trialsOpen: boolean;
}

export function gateMode(who: GateWho): GateMode {
  if (!who.trialsOpen) return "paid";
  if (!who.signedIn) return "signup_trial";
  if (!who.organizationType) return "resume";
  const refusal = trialRefusal({
    signedIn: true,
    organizationType: who.organizationType,
    organizationStatus: who.organizationStatus,
    organizationProfileStatus: who.organizationProfileStatus,
    riskFlagged: who.riskFlagged,
    paid: Boolean(who.paid),
    existing: who.trial && who.trial.status !== "none" ? { startedAt: who.trial.startedAt ?? "", endsAt: who.trial.endsAt ?? "" } : null,
  });
  return refusal === null ? "trial" : "paid";
}

/** Can this member still start a trial right now (ignoring whether trials are switched on)? */
export function canStartTrialNow(who: Omit<GateWho, "trialsOpen">): boolean {
  return gateMode({ ...who, trialsOpen: true }) === "trial";
}

const MAX_RETURN = 300;

/**
 * A page to come back to after the trial starts: a same-site path, with the
 * language prefix removed (links are localized when they are followed), and
 * never an API, auth or trial route (no loops, no side effects).
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  const next = safeNextPath(raw ?? null);
  if (!next || next.length > MAX_RETURN) return null;
  const path = splitLocale(next).path || "/";
  if (/^\/(?:api|auth|start-trial|checkout)(?:[/?#]|$)/.test(path)) return null;
  return path;
}

/** `path` with ?trial=started added (before any #hash), so the banner refreshes after a trial starts. */
export function withTrialStartedParam(path: string): string {
  const hash = path.indexOf("#");
  const base = hash >= 0 ? path.slice(0, hash) : path;
  const tail = hash >= 0 ? path.slice(hash) : "";
  if (/[?&]trial=/.test(base)) return path;
  return `${base}${base.includes("?") ? "&" : "?"}trial=started${tail}`;
}

/** /start-trial?source=…&return=…: the page that finishes a trial a visitor asked for before signing in. */
export function startTrialPath(source: TrialSource, returnPath?: string | null): string {
  const ret = safeReturnPath(returnPath);
  return `/start-trial?source=${source}${ret ? `&return=${encodeURIComponent(ret)}` : ""}`;
}

/** Sign-up that resumes into the trial: /sign-up?role=trade&plan=trial&source=…&return=… */
export function trialSignUpHref(source: TrialSource, returnPath?: string | null): string {
  const ret = safeReturnPath(returnPath);
  return `/sign-up?role=trade&plan=trial&source=${source}${ret ? `&return=${encodeURIComponent(ret)}` : ""}`;
}

/**
 * What a sign-up page with plan=trial resumes into: the /start-trial path
 * (carried through the emailed link and onboarding as `next`). Null when the
 * query isn't a trial ask.
 */
export function trialNextFromSignUp(q: { plan?: string | null; source?: string | null; return?: string | null }): string | null {
  if (q.plan !== "trial") return null;
  return startTrialPath(parseTrialSource(q.source), q.return ?? null);
}

export interface GateOffer {
  mode: GateMode;
  /** A link for every mode but "trial", which is a form posting startTrialAction. */
  href: string;
  /** Always "See plans". */
  plansHref: string;
}

/**
 * Where the primary button of a Pro gate goes. `paidHref` is the page's own
 * paid link (billing for members, plan sign-up for visitors).
 */
export function gateOffer(who: GateWho, opts: { source: TrialSource; returnPath?: string | null; paidHref: string; plansHref?: string }): GateOffer {
  const mode = gateMode(who);
  const plansHref = opts.plansHref ?? "/pricing";
  if (mode === "trial") return { mode, href: startTrialPath(opts.source, opts.returnPath), plansHref };
  if (mode === "signup_trial") return { mode, href: trialSignUpHref(opts.source, opts.returnPath), plansHref };
  if (mode === "resume") return { mode, href: startTrialPath(opts.source, opts.returnPath), plansHref };
  return { mode, href: opts.paidHref, plansHref };
}

/** A session-shaped object to GateWho (kept here so callers don't each re-derive the fields). */
export function whoFromSession(
  session: {
    paid?: boolean;
    trial?: TrialState;
    profile?: { onboarding_completed?: boolean | null } | null;
    organization?: { organization_type?: string | null; status?: string | null; profile_status?: string | null } | null;
  } | null,
  trialsOpen: boolean,
): GateWho {
  return {
    signedIn: Boolean(session),
    onboarded: Boolean(session?.profile?.onboarding_completed),
    organizationType: session?.organization?.organization_type ?? null,
    organizationStatus: session?.organization?.status ?? null,
    organizationProfileStatus: session?.organization?.profile_status ?? null,
    paid: Boolean(session?.paid),
    trial: session?.trial,
    trialsOpen,
  };
}

export { orgIsHeld };
