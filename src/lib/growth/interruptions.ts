import { isPmAudiencePath, type Audience } from "@/lib/audience/pm";

/**
 * When the home page may interrupt a visitor with the trade-side email popup
 * ("Free for trade companies") or a corner toast.
 *
 * Rules (persona QA 2026-10-21: the popup opened 9 s into a first visit,
 * covered the condo-board panel, and opened under a French property
 * manager's cursor and swallowed her click; toasts kept rotating over
 * headings and the trade form):
 *  - Never on a property-manager / landlord / condo-board / public-buyer page
 *    or the RFP writer, and never to a visitor who chose a property-manager
 *    role (AUDIENCE_COOKIE).
 *  - At most once per visitor (its own cookie, one year).
 *  - Never on the visitor's first page view before they interact with it.
 *  - Never right after a click or key press (it would take the click).
 *  - Toasts: one, not a rotation, and not on phones (they cover the trade form).
 *
 * Pure; the home page reads cookies and events and asks.
 */

/** Set once the popup has been shown (one year). */
export const PROMPT_COOKIE = "pmrfp_tp";
/** Set once a toast has been shown or dismissed (one year). */
export const TOAST_COOKIE = "pmrfp_toast";
/** Page views this browser session (session cookie). */
export const VIEWS_COOKIE = "pmrfp_pv";

/** Ms after a click / key press during which nothing may open. */
export const QUIET_AFTER_INPUT_MS = 1500;

export interface InterruptContext {
  /** Page path without the locale prefix. */
  path: string;
  /** The side the visitor picked, if any. */
  audience: Audience | null;
  /** This interruption's "already shown" cookie is set. */
  alreadyShown: boolean;
  /** Page views this session, counting this one. */
  pageViews: number;
  /** The visitor scrolled, clicked or typed on this page. */
  interacted: boolean;
}

/** May the trade popup (or a toast) be shown at all on this view? */
export function mayInterrupt(c: InterruptContext): boolean {
  if (isPmAudiencePath(c.path) || c.audience === "pm") return false;
  if (c.alreadyShown) return false;
  if (c.pageViews <= 1 && !c.interacted) return false;
  return true;
}

/** Not right after the visitor clicked or pressed a key (ms timestamps). */
export function quietEnough(now: number, lastInputAt: number | null): boolean {
  return lastInputAt == null || now - lastInputAt >= QUIET_AFTER_INPUT_MS;
}

/** Toasts also stay off phones and narrow windows. */
export function mayToast(c: InterruptContext, viewportWidth: number): boolean {
  return viewportWidth >= 768 && mayInterrupt(c);
}

/** A cookie's value from document.cookie (or a Cookie header). */
export function readCookie(cookie: string | null | undefined, name: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(cookie ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}
