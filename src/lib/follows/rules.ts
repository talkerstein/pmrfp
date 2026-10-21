/**
 * Follow a buyer or town (PMRFP for Towns, Part B1): the rules, pure and
 * dependency-light so the API, the pages, the client button and the tests
 * share them (test/unit/buyer-follows.test.ts).
 *
 *  - Who can follow: trade and supplier accounts, and anyone with Trade Pro
 *    (the same people who can save RFPs). Property managers and public
 *    buyers have nothing to bid on, so the button tells them so.
 *  - How many: a free account follows up to FREE_FOLLOW_LIMIT buyers; Trade
 *    Pro and the 14-day trial are unlimited. The server enforces it (the
 *    follow_buyer() function in migration 20261021000110 takes the limit
 *    and locks the person, so two clicks can't both take the last slot).
 *  - A follow is keyed by the page key "<province-slug>/<buyer-slug>"
 *    (lib/towns/managed BUYER_KEY): slugs repeat across provinces.
 *  - Signed-out visitors go to sign-up with the follow in `next`
 *    (/follow?buyer=<key>), which survives every sign-up path (password,
 *    emailed link, Google) and onboarding; /follow completes it and sends
 *    them back to the page.
 */

/** Same pattern as lib/towns/managed BUYER_KEY (kept here so client code doesn't pull in zod). */
const BUYER_KEY = /^[a-z0-9-]{2,40}\/[a-z0-9][a-z0-9-]{0,119}$/;

/** Keep in step with the limit the server passes to follow_buyer() (migration 20261021000110). */
export const FREE_FOLLOW_LIMIT = 3;

/** Roles that can follow without Trade Pro (lib/access/free-actions FREE_SAVE_ROLES). */
export const FOLLOW_ROLES = ["trade", "supplier"] as const;

export const FOLLOW_PATH = "/follow";
export const FOLLOWING_PATH = "/dashboard/following";

export interface FollowViewer {
  primaryRole: string;
  /** Trade Pro now: paying, or a trial that hasn't ended (session.hasTradeAccess). */
  hasTradeAccess: boolean;
}

export function canFollowBuyers(v: FollowViewer | null | undefined): boolean {
  if (!v) return false;
  return v.hasTradeAccess || (FOLLOW_ROLES as readonly string[]).includes(v.primaryRole);
}

/** The most buyers this account may follow: 3 free, null (unlimited) with Trade Pro or a trial. */
export function followLimit(pro: boolean): number | null {
  return pro ? null : FREE_FOLLOW_LIMIT;
}

export interface FollowUsage {
  used: number;
  /** null: unlimited (Trade Pro, trial). */
  limit: number | null;
  /** Follows left (null when unlimited). */
  left: number | null;
  full: boolean;
}

export function followUsage(used: number, pro: boolean): FollowUsage {
  const limit = followLimit(pro);
  const left = limit == null ? null : Math.max(0, limit - used);
  return { used, limit, left, full: limit != null && used >= limit };
}

export type FollowStatus = "followed" | "already" | "limit";

/**
 * The decision follow_buyer() makes in the database, in TypeScript (the
 * fallback and the tests): following twice is a no-op, a free account at
 * its limit is refused, everything else follows.
 */
export function followDecision(x: { already: boolean; used: number; pro: boolean }): FollowStatus {
  if (x.already) return "already";
  const limit = followLimit(x.pro);
  if (limit != null && x.used >= limit) return "limit";
  return "followed";
}

/** A page key, or null. */
export function parseFollowKey(v: unknown): string | null {
  return typeof v === "string" && BUYER_KEY.test(v) ? v : null;
}

/** Where the follow intent lives through sign-up: "/follow?buyer=ontario/town-of-cobourg". */
export function followIntentPath(key: string): string {
  return `${FOLLOW_PATH}?${new URLSearchParams({ buyer: key }).toString()}`;
}

/** The key a `next` path carries ("/follow?buyer=…", with or without a language prefix), else null. */
export function followIntentFrom(next: string | null | undefined): string | null {
  if (!next) return null;
  let url: URL;
  try {
    url = new URL(next, "https://pmrfp.com");
  } catch {
    return null;
  }
  if (!/^(?:\/(?:en|fr|es))?\/follow\/?$/.test(url.pathname)) return null;
  return parseFollowKey(url.searchParams.get("buyer"));
}

/**
 * "Follow" for a signed-out visitor: a free trade sign-up with the town's
 * region (or province) picked, that comes back through /follow (the follow
 * completes after onboarding, then they land on the page again).
 * `localizedIntent` is followIntentPath(key) in the page's language.
 */
export function followSignUpHref(localizedIntent: string, regionSlug: string | null): string {
  const q = new URLSearchParams({ role: "trade" });
  if (regionSlug) q.set("region", regionSlug);
  q.set("next", localizedIntent);
  return `/sign-up?${q.toString()}`;
}

/** What /follow does for this request. */
export type FollowLanding = "sign-up" | "onboarding" | "not-allowed" | "confirm" | "follow";

/**
 * /follow?buyer=<key>: a signed-out visitor goes to sign-up (the intent rides
 * in `next`), a property manager or public buyer is told following is for
 * trades, and a trade that hasn't finished onboarding goes there first. The
 * follow itself only happens straight away when the request comes from
 * PMRFP itself (the onboarding redirect: Sec-Fetch-Site same-origin) or was
 * typed / opened from outside a browser ("none"); a link from another site
 * (cross-site) or a prefetch gets a one-click confirm instead, so no other
 * site can make someone follow a buyer.
 */
export function followLanding(x: {
  signedIn: boolean;
  onboarded: boolean;
  canFollow: boolean;
  /** The Sec-Fetch-Site request header (null when the browser doesn't send it). */
  fetchSite: string | null;
  prefetch?: boolean;
}): FollowLanding {
  if (!x.signedIn) return "sign-up";
  if (!x.canFollow) return "not-allowed";
  if (!x.onboarded) return "onboarding";
  if (x.prefetch) return "confirm";
  const site = (x.fetchSite ?? "").toLowerCase();
  return site === "cross-site" || site === "same-site" ? "confirm" : "follow";
}

/* ------------------------------------------------------------------ alerts */

/** Same-day follow emails for Trade Pro and trial (default off): BUYER_FOLLOW_ALERTS_ENABLED=1. */
export function buyerFollowAlertsEnabled(env: string | undefined = process.env.BUYER_FOLLOW_ALERTS_ENABLED): boolean {
  return env === "1" || env === "true";
}

/** lead_alert_log key for one listing sent to one follower (lib/follows/alerts-server). */
export function followAlertKey(rfpId: string): string {
  return `follow:${rfpId}`;
}
